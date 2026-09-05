package service

import (
	"context"
	"database/sql/driver"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"

	"github.com/lvgj-stack/stander/internal/apperr"
	"github.com/lvgj-stack/stander/internal/identity"
	"github.com/lvgj-stack/stander/internal/service/req"
)

// capturedArg matches anything and remembers what it saw, so a test can assert
// that the value which went into a statement is the one the action handed back.
type capturedArg struct{ value driver.Value }

func (c *capturedArg) Match(v driver.Value) bool {
	c.value = v
	return true
}

// expectNodeInsert declares the single insert that creating a node issues, and
// returns the captured node key.
//
// The arguments are positional and cover every column of entity.Node, so
// regenerating the entity after a schema change (`stander gen`) fails the tests
// using this on the argument count. That is the intent rather than a cost: what
// creation writes is the thing under test, and a new column changes it.
func expectNodeInsert(mock sqlmock.Sqlmock, name, nodeType string, preferIPv6 bool) *capturedArg {
	key := &capturedArg{}
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO `nodes`").WithArgs(
		sqlmock.AnyArg(), // created_at
		sqlmock.AnyArg(), // updated_at
		sqlmock.AnyArg(), // deleted_at
		name,             // node_name
		sqlmock.AnyArg(), // ip
		sqlmock.AnyArg(), // manager_ip
		sqlmock.AnyArg(), // port
		key,              // key
		"unregistered",   // status: it has never registered, and says so
		nodeType,         // node_type
		sqlmock.AnyArg(), // ipv4
		sqlmock.AnyArg(), // ipv6
		sqlmock.AnyArg(), // rate
		sqlmock.AnyArg(), // protocol
		sqlmock.AnyArg(), // iepl
		preferIPv6,       // prefer_ipv6
	).WillReturnResult(sqlmock.NewResult(7, 1))
	mock.ExpectCommit()
	return key
}

// A forwarding account holds a valid token against this API, so the absence of
// the button on their side was never the check. See AddNode for what the
// branch this refusal replaces let them grant themselves.
func TestAddNodeRefusesANonAdmin(t *testing.T) {
	// No expectations are declared, so the mock driver fails any statement the
	// action issues; the assertion below would then see that failure instead
	// of ErrForbidden. That is what pins "refused before it reaches the
	// database" — ExpectationsWereMet cannot, having nothing to report on.
	newMockDB(t)

	ctx := identity.NewContext(context.Background(), identity.Principal{UserID: 3, RoleCode: identity.RoleUser})
	_, err := AddNode(ctx, &req.AddNodeReq{NodeName: "hk-01", NodeType: "inbound", Rate: 1})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("AddNode as USER = %v, want ErrForbidden", err)
	}
}

// Creating a node is one insert and nothing else.
//
// The mock is ordered and holds exactly this one write, so re-reading the row
// just inserted or inserting a second row into the mapping table fails the
// test. Those are the two statements this action used to issue: the second
// write had no transaction around it, so its failure left a node nobody owned,
// and the re-read discarded its error and then dereferenced a nil row.
func TestAddNodeWritesOneRowAndReturnsItsKey(t *testing.T) {
	mock := newMockDB(t)
	key := expectNodeInsert(mock, "hk-01", "inbound", false)

	got, err := AddNode(adminCtx(), &req.AddNodeReq{NodeName: "hk-01", NodeType: "inbound", Rate: 1.5})
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	if _, err := uuid.Parse(got.Key); err != nil {
		t.Errorf("returned key %q is not a uuid: %v", got.Key, err)
	}
	// The key is the credential the agent authenticates with, so the one the
	// install command carries has to be the one that reached the table.
	if key.value != got.Key {
		t.Errorf("inserted key = %v, returned key = %q", key.value, got.Key)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// A failed insert has to surface as an error. The version this replaces read
// the row back by key afterwards and ignored that read's error, so a write
// that had not landed became a nil dereference rather than a failure.
func TestAddNodePropagatesTheWriteError(t *testing.T) {
	mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO `nodes`").WillReturnError(errors.New("write conflict"))
	mock.ExpectRollback()

	if _, err := AddNode(adminCtx(), &req.AddNodeReq{NodeName: "hk-01", NodeType: "inbound", Rate: 1}); err == nil {
		t.Fatal("expected the insert error to propagate")
	}
	// Also that the failed write was rolled back rather than left open.
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// The rules a creation request has to satisfy, in one table. This table being
// able to reach them at all is why they are not `vd:` tags; see validateAddNode.
func TestValidateAddNode(t *testing.T) {
	tests := []struct {
		name     string
		req      req.AddNodeReq
		wantName string
		wantErr  bool
	}{
		{"a valid request", req.AddNodeReq{NodeName: "hk-01", NodeType: "inbound", Rate: 1}, "hk-01", false},
		{"outbound is a node type too", req.AddNodeReq{NodeName: "hk-01", NodeType: "outbound", Rate: 1}, "hk-01", false},
		{"a fractional rate is fine", req.AddNodeReq{NodeName: "hk-01", NodeType: "inbound", Rate: 0.1}, "hk-01", false},
		{"surrounding space is trimmed", req.AddNodeReq{NodeName: "  hk-01  ", NodeType: "inbound", Rate: 1}, "hk-01", false},
		{"an empty name", req.AddNodeReq{NodeName: "", NodeType: "inbound", Rate: 1}, "", true},
		{"a name of only spaces", req.AddNodeReq{NodeName: "   ", NodeType: "inbound", Rate: 1}, "", true},
		// A zero rate is not "no multiplier": it is traffic that never counts.
		{"a zero rate", req.AddNodeReq{NodeName: "hk-01", NodeType: "inbound", Rate: 0}, "", true},
		{"a negative rate", req.AddNodeReq{NodeName: "hk-01", NodeType: "inbound", Rate: -1}, "", true},
		{"an unknown node type", req.AddNodeReq{NodeName: "hk-01", NodeType: "relay", Rate: 1}, "", true},
		{"an empty node type", req.AddNodeReq{NodeName: "hk-01", NodeType: "", Rate: 1}, "", true},
		{"node types are not case-insensitive", req.AddNodeReq{NodeName: "hk-01", NodeType: "Inbound", Rate: 1}, "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			name, err := validateAddNode(&tt.req)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("validateAddNode(%+v) = nil, want an error", tt.req)
				}
				// The caller sent something wrong; this is not a server fault.
				if kind := apperr.KindOf(err); kind != apperr.InvalidArgument {
					t.Errorf("error kind = %v, want InvalidArgument", kind)
				}
				return
			}
			if err != nil {
				t.Fatalf("validateAddNode(%+v) = %v, want nil", tt.req, err)
			}
			if name != tt.wantName {
				t.Errorf("name = %q, want %q", name, tt.wantName)
			}
		})
	}
}

// The rule has to be applied, not merely to exist: a rejected request must not
// reach the table. No expectations are declared, so any statement issued fails
// the call and the assertion below would see that instead.
func TestAddNodeRejectsABadRequestBeforeTheDatabase(t *testing.T) {
	newMockDB(t)

	_, err := AddNode(adminCtx(), &req.AddNodeReq{NodeName: "  ", NodeType: "inbound", Rate: 1})
	if apperr.KindOf(err) != apperr.InvalidArgument {
		t.Fatalf("AddNode with a blank name = %v, want an InvalidArgument error", err)
	}
}

// And the trimmed name is the one that reaches the table. Validating in a pure
// function proves the trim happens; only this proves the action stores it.
func TestAddNodeStoresTheTrimmedName(t *testing.T) {
	mock := newMockDB(t)
	expectNodeInsert(mock, "hk-01", "inbound", false)

	if _, err := AddNode(adminCtx(), &req.AddNodeReq{NodeName: "  hk-01  ", NodeType: "inbound", Rate: 1}); err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// Registering is what turns a node's status from "never seen" into "its agent
// has called home", and it has to happen on the registration the agent already
// makes at start-up rather than needing anything restarted.
func TestRegisterNodeMarksTheNodeRegistered(t *testing.T) {
	mock := newMockDB(t)

	mock.ExpectQuery("SELECT \\* FROM `nodes`").
		WillReturnRows(sqlmock.NewRows([]string{"id", "key"}).AddRow(7, "node-key"))
	mock.ExpectQuery("SELECT \\* FROM `rules`").WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery("SELECT \\* FROM `chains`").WillReturnRows(sqlmock.NewRows([]string{"id"}))

	status := &capturedArg{}
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE `nodes`").WithArgs(
		sqlmock.AnyArg(), // updated_at
		sqlmock.AnyArg(), // ip
		sqlmock.AnyArg(), // manager_ip
		sqlmock.AnyArg(), // port
		status,           // status
		sqlmock.AnyArg(), // ipv4
		sqlmock.AnyArg(), // ipv6
		sqlmock.AnyArg(), // where key
	).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	ctx := identity.NewContext(context.Background(), identity.Principal{NodeKey: "node-key"})
	if _, err := RegisterNode(ctx, &req.RegisterNodeReq{Ipv4: "10.0.0.5", Port: 8123}, "10.0.0.5"); err != nil {
		t.Fatalf("RegisterNode: %v", err)
	}
	// The literal, not the constant: these two strings are a contract with the
	// console, which maps them to 未注册 / 已注册 from constants of its own.
	// Asserting the constant against itself would let a rename on either side
	// pass here while every node silently rendered as an em dash.
	if status.value != "registered" {
		t.Errorf("status written = %v, want %q", status.value, "registered")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// The IPv6 preference has to reach the row.
//
// It was a bindable field the action simply ignored: the console sent it, the
// request struct carried it, and creation dropped it on the floor. The install
// command gets shown again later from the node list, and only a stored value
// can tell that dialog whether to append --prefer-ipv6 — which is why
// asserting the insert, rather than the request, is what pins this.
func TestAddNodeStoresTheIPv6Preference(t *testing.T) {
	mock := newMockDB(t)
	expectNodeInsert(mock, "hk-01", "inbound", true)

	_, err := AddNode(adminCtx(), &req.AddNodeReq{
		NodeName: "hk-01", NodeType: "inbound", Rate: 1, DefaultIPv6: true,
	})
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}
