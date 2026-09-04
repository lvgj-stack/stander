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

// RoleSuperAdmin bypasses every per-resource permission check.
const RoleSuperAdmin = "SUPER_ADMIN"

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
