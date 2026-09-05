// Package identity carries the caller's identity through a request.
//
// Before this package existed the service layer read the acting user out of
// Hertz's *app.RequestContext with untyped getters
// (ctx.GetInt32("X-User-Id"), ctx.GetString("X-Role-Id")). That tied every
// permission check to the HTTP framework and made the service layer impossible
// to unit test. The identity now travels in the standard context.Context, so
// the service layer depends on nothing but the standard library for it.
package identity

import "context"

// The two roles this product has.
//
// RoleSuperAdmin bypasses every per-resource permission check and lands on the
// admin console; RoleUser lands on the user portal. There is no third one and
// no way to add one: a role decides which side of the console an account gets
// and nothing else, and the whole authorization boundary is IsSuperAdmin.
// Finer-grained visibility is granted per user in user_role_node_mappings /
// user_role_chain_mappings, not by inventing a role.
const (
	RoleSuperAdmin = "SUPER_ADMIN"
	RoleUser       = "USER"
)

// NormalizeRole collapses a stored role code onto one of the two.
//
// The `role` table is older than this rule and can still hold rows the product
// no longer has (the two-sides migration deletes ROLE_QA, but a database that
// was never migrated keeps it). Everything but SUPER_ADMIN already authorizes
// exactly like USER — IsSuperAdmin is the only check — so reporting those
// accounts as USER tells the truth about what they can do rather than echoing
// a code the console has no screen for.
func NormalizeRole(code string) string {
	if code == RoleSuperAdmin {
		return RoleSuperAdmin
	}
	return RoleUser
}

// Principal is who is making the current call.
//
// A request carries either a user identity (the admin console and the
// controller API) or a node key (an agent calling home), never both.
type Principal struct {
	UserID   int32
	RoleCode string
	NodeKey  string
}

// IsSuperAdmin reports whether this caller skips per-resource authorization.
func (p Principal) IsSuperAdmin() bool {
	return p.RoleCode == RoleSuperAdmin
}

type principalKey struct{}

// NewContext returns a copy of ctx carrying p.
func NewContext(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

// FromContext returns the principal carried by ctx.
//
// An absent principal yields the zero Principal rather than an error: an
// unauthenticated caller is simply a principal with no user and no role, and
// every permission check already treats that as "not permitted".
func FromContext(ctx context.Context) Principal {
	p, _ := ctx.Value(principalKey{}).(Principal)
	return p
}
