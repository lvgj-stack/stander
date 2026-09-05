package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"

	"github.com/lvgj-stack/stander/internal/identity"
	"github.com/lvgj-stack/stander/internal/model/entity"
	"github.com/lvgj-stack/stander/internal/service/req"
)

// GetUserPlanInfo takes the user id from the request body. That is fine for the
// admin console, where only the super admin opens the screen, but the user
// portal calls the same action for the signed-in user — so a plain forwarding
// user must not be able to read someone else's plan and traffic history by
// sending a different id.
func TestScopeToCaller(t *testing.T) {
	tests := []struct {
		name      string
		principal identity.Principal
		requested int32
		want      int32
	}{
		{
			name:      "super admin reads whoever was asked for",
			principal: identity.Principal{UserID: 1, RoleCode: identity.RoleSuperAdmin},
			requested: 42,
			want:      42,
		},
		{
			name:      "ordinary user asking about someone else reads themselves",
			principal: identity.Principal{UserID: 7, RoleCode: "USER"},
			requested: 42,
			want:      7,
		},
		{
			name:      "ordinary user asking about themselves is unaffected",
			principal: identity.Principal{UserID: 7, RoleCode: "USER"},
			requested: 7,
			want:      7,
		},
		{
			name:      "an unsent id still resolves to the caller",
			principal: identity.Principal{UserID: 7, RoleCode: "USER"},
			requested: 0,
			want:      7,
		},
		{
			name:      "an anonymous caller gets no one",
			principal: identity.Principal{},
			requested: 42,
			want:      0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := identity.NewContext(context.Background(), tt.principal)
			if got := scopeToCaller(ctx, tt.requested); got != tt.want {
				t.Fatalf("scopeToCaller() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestRequireSuperAdmin(t *testing.T) {
	tests := []struct {
		name      string
		principal identity.Principal
		wantErr   bool
	}{
		{"super admin passes", identity.Principal{UserID: 1, RoleCode: identity.RoleSuperAdmin}, false},
		{"ordinary user is refused", identity.Principal{UserID: 7, RoleCode: "USER"}, true},
		{"unknown role is refused", identity.Principal{UserID: 7, RoleCode: "ROLE_QA"}, true},
		{"anonymous caller is refused", identity.Principal{}, true},
		// An agent authenticates with a node key and carries no role. It must
		// not fall through into the administrative actions.
		{"node key is refused", identity.Principal{NodeKey: "k"}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := identity.NewContext(context.Background(), tt.principal)
			err := requireSuperAdmin(ctx)
			if tt.wantErr && !errors.Is(err, ErrForbidden) {
				t.Fatalf("requireSuperAdmin() = %v, want ErrForbidden", err)
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("requireSuperAdmin() = %v, want nil", err)
			}
		})
	}
}

// A node's key is the credential the controller uses to command that node's
// agent, and it is a serialised field of entity.Node — so it reaches the
// browser on every list action unless it is stripped. Leaving the column out
// of a table hides it from the page, not from the response body.
func TestRedactForCaller(t *testing.T) {
	key := "node-secret"
	chainKey := "chain-secret"

	newFixtures := func() ([]*entity.Node, []*entity.Chain, []*entity.Rule) {
		k, ck := key, chainKey
		return []*entity.Node{{ID: 1, Key: &k, ManagerIP: "10.0.0.1"}},
			[]*entity.Chain{{ID: 2, Key: &ck, Node: entity.Node{ID: 3, Key: &k, ManagerIP: "10.0.0.2"}}},
			[]*entity.Rule{{
				ID:    4,
				Node:  entity.Node{ID: 5, Key: &k, ManagerIP: "10.0.0.3"},
				Chain: entity.Chain{ID: 6, Key: &ck, Node: entity.Node{ID: 7, Key: &k, ManagerIP: "10.0.0.4"}},
			}}
	}

	t.Run("an ordinary user sees no keys anywhere", func(t *testing.T) {
		nodes, chains, rules := newFixtures()
		ctx := identity.NewContext(context.Background(), identity.Principal{UserID: 7, RoleCode: "USER"})
		redactForCaller(ctx, nodes, chains, rules)

		for _, n := range []*entity.Node{nodes[0], &chains[0].Node, &rules[0].Node, &rules[0].Chain.Node} {
			if n.Key != nil {
				t.Errorf("node %d still carries its key", n.ID)
			}
			if n.ManagerIP != "" {
				t.Errorf("node %d still carries its manager IP", n.ID)
			}
		}
		if chains[0].Key != nil || rules[0].Chain.Key != nil {
			t.Error("a chain still carries its key")
		}
	})

	t.Run("the super admin sees them", func(t *testing.T) {
		nodes, chains, rules := newFixtures()
		ctx := identity.NewContext(context.Background(), identity.Principal{UserID: 1, RoleCode: identity.RoleSuperAdmin})
		redactForCaller(ctx, nodes, chains, rules)

		if nodes[0].Key == nil || nodes[0].ManagerIP == "" {
			t.Error("the admin console needs the node key and manager IP")
		}
		if chains[0].Key == nil || rules[0].Chain.Key == nil {
			t.Error("the admin console needs the chain key")
		}
	})

	t.Run("nil entries and empty slices are tolerated", func(t *testing.T) {
		ctx := identity.NewContext(context.Background(), identity.Principal{RoleCode: "USER"})
		redactForCaller(ctx, nil, nil, []*entity.Rule{nil})
		redactForCaller(ctx, nil, nil, nil)
	})
}

// The grants these two actions manage are what make the user portal usable at
// all — every read and write on that side is scoped to them — so they are
// administrator-only, and must refuse before touching the database.
func TestUserResourceGrantsAreAdminOnly(t *testing.T) {
	userCtx := identity.NewContext(context.Background(), identity.Principal{UserID: 3, RoleCode: "USER"})

	t.Run("GetUserResources", func(t *testing.T) {
		mock := newMockDB(t)
		if _, err := GetUserResources(userCtx, &req.GetUserResourcesReq{UserId: 3}); !errors.Is(err, ErrForbidden) {
			t.Fatalf("GetUserResources as USER = %v, want ErrForbidden", err)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("the refusal must not have hit the database: %v", err)
		}
	})

	// The dangerous direction: a user granting themselves every node.
	t.Run("SetUserResources", func(t *testing.T) {
		mock := newMockDB(t)
		_, err := SetUserResources(userCtx, &req.SetUserResourcesReq{UserId: 3, NodeIds: []int64{1, 2}})
		if !errors.Is(err, ErrForbidden) {
			t.Fatalf("SetUserResources as USER = %v, want ErrForbidden", err)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("the refusal must not have hit the database: %v", err)
		}
	})
}

// An id with no row behind it must be rejected rather than stored: the grant
// would sit there looking like access to whatever id gets reused next.
func TestSetUserResourcesRejectsAnUnknownNode(t *testing.T) {
	mock := newMockDB(t)
	mock.ExpectQuery("SELECT \\* FROM `nodes`").WillReturnRows(sqlmock.NewRows([]string{"id"}))

	_, err := SetUserResources(adminCtx(), &req.SetUserResourcesReq{UserId: 3, NodeIds: []int64{404}})
	if err == nil {
		t.Fatal("expected a grant to a non-existent node to be refused")
	}
	if !strings.Contains(err.Error(), "404") {
		t.Errorf("the error should name the offending id, got %v", err)
	}
}
