package service

import (
	"context"
	"database/sql/driver"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"

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
//
// The arguments are positional and cover every column of entity.Node, so
// regenerating the entity after a schema change (`stander gen`) fails this test
// on the argument count. That is the intent rather than a cost: what creation
// writes is the thing under test, and a new column changes it.
func TestAddNodeWritesOneRowAndReturnsItsKey(t *testing.T) {
	mock := newMockDB(t)

	key := &capturedArg{}
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO `nodes`").WithArgs(
		sqlmock.AnyArg(), // created_at
		sqlmock.AnyArg(), // updated_at
		sqlmock.AnyArg(), // deleted_at
		"hk-01",          // node_name
		sqlmock.AnyArg(), // ip
		sqlmock.AnyArg(), // manager_ip
		sqlmock.AnyArg(), // port
		key,              // key
		sqlmock.AnyArg(), // status
		"inbound",        // node_type
		sqlmock.AnyArg(), // ipv4
		sqlmock.AnyArg(), // ipv6
		sqlmock.AnyArg(), // rate
		sqlmock.AnyArg(), // protocol
		sqlmock.AnyArg(), // iepl
	).WillReturnResult(sqlmock.NewResult(7, 1))
	mock.ExpectCommit()

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
