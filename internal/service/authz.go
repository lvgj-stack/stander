package service

import (
	"context"
	"errors"

	"github.com/lvgj-stack/stander/internal/identity"
	"github.com/lvgj-stack/stander/internal/model/dal"
	"github.com/lvgj-stack/stander/internal/model/entity"
)

// ErrForbidden is returned when a caller asks for something only an
// administrator may do. The handlers turn it into a business error in the
// response envelope, like every other service error.
var ErrForbidden = errors.New("没有权限执行该操作")

// requireSuperAdmin gates an action on the caller being an administrator.
//
// The console has exactly two sides and the role is what decides which one an
// account lands on. That split is only real if the backend enforces it: the
// user portal is served by the same API as the admin console, so an action
// that is absent from the user portal's screens is not thereby unreachable —
// it is one hand-written request away.
func requireSuperAdmin(ctx context.Context) error {
	if !identity.FromContext(ctx).IsSuperAdmin() {
		return ErrForbidden
	}
	return nil
}

// scopeToCaller returns the user id a request may actually read.
//
// The super admin reads whoever was asked for; everyone else reads only
// themselves, whatever id they sent.
func scopeToCaller(ctx context.Context, requested int32) int32 {
	caller := identity.FromContext(ctx)
	if caller.IsSuperAdmin() {
		return requested
	}
	return caller.UserID
}

// redactNode blanks the fields of a node that only an administrator may see.
//
// `entity.Node` is serialised straight to JSON by every list action, and it
// carries the node key — the credential the controller uses to command that
// node's agent (see the client.DoRequest calls in this package) — plus the
// manager IP the agent listens on. Leaving those columns out of a table on the
// user portal hides them from the page, not from the response body.
func redactNode(n *entity.Node) {
	if n == nil {
		return
	}
	n.Key = nil
	n.ManagerIP = ""
}

// redactChain does the same for a chain, which carries its own key and an
// embedded node.
func redactChain(c *entity.Chain) {
	if c == nil {
		return
	}
	c.Key = nil
	redactNode(&c.Node)
}

// redactForCaller strips those fields unless the caller is an administrator.
//
// It takes the entities a list action is about to return. Nothing here is
// written back — these are read paths handing rows to the JSON encoder.
func redactForCaller(ctx context.Context, nodes []*entity.Node, chains []*entity.Chain, rules []*entity.Rule) {
	if identity.FromContext(ctx).IsSuperAdmin() {
		return
	}
	for _, n := range nodes {
		redactNode(n)
	}
	for _, c := range chains {
		redactChain(c)
	}
	for _, r := range rules {
		if r == nil {
			continue
		}
		redactNode(&r.Node)
		redactChain(&r.Chain)
	}
}

// checkRuleOwnership gates an action on a rule the caller may act on.
//
// DelRule has always done this inline; ModifyRule and TestRule did not, which
// meant any signed-in account could change another tenant's `remote_addr` —
// silently redirecting their forwarded traffic — or probe rule ids to learn
// node names and destinations. Sharing one helper is what keeps the three from
// drifting apart again.
//
// A rule the caller does not hold reports as not found rather than forbidden:
// the caller has no way to know the id exists, and saying so would turn this
// into an enumeration oracle.
func checkRuleOwnership(ctx context.Context, ruleID int64) error {
	if identity.FromContext(ctx).IsSuperAdmin() {
		return nil
	}
	_, err := dal.Rule.WithContext(ctx).
		Where(dal.Rule.UserID.Eq(identity.FromContext(ctx).UserID), dal.Rule.ID.Eq(ruleID)).
		First()
	return err
}
