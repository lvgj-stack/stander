package service

import (
	"context"
	"testing"

	"github.com/lvgj-stack/stander/internal/identity"
	"github.com/lvgj-stack/stander/internal/service/req"
)

// This test exists to demonstrate what the refactor bought: before the service
// layer was decoupled from Hertz, exercising this authorization rule required
// standing up a server and forging a *app.RequestContext. It is now a plain
// function call.
//
// The database is deliberately left uninitialised. A non-admin must be refused
// before any query runs, so if this test ever reaches the DAL it panics on the
// nil connection instead of passing quietly.
func TestListChainGroupRefusesNonAdminBeforeTouchingTheDatabase(t *testing.T) {
	for _, role := range []string{"USER", "ROLE_QA", ""} {
		t.Run("role="+role, func(t *testing.T) {
			ctx := identity.NewContext(context.Background(), identity.Principal{
				UserID:   7,
				RoleCode: role,
			})

			got, err := ListChainGroup(ctx, &req.ListChainGroupReq{})
			if err != nil {
				t.Fatalf("a refused caller should get an empty result, not an error: %v", err)
			}
			if len(got.ChainGroups) != 0 {
				t.Errorf("got %d chain groups, want none for role %q", len(got.ChainGroups), role)
			}
		})
	}
}

// An unauthenticated call carries the zero principal and must be refused the
// same way, rather than falling through to the super-admin branch.
func TestListChainGroupRefusesAnonymous(t *testing.T) {
	got, err := ListChainGroup(context.Background(), &req.ListChainGroupReq{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got.ChainGroups) != 0 {
		t.Errorf("got %d chain groups, want none", len(got.ChainGroups))
	}
}
