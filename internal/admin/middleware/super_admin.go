package middleware

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/lvgj-stack/stander/internal/admin/handler"
	"github.com/lvgj-stack/stander/internal/identity"
)

// SuperAdmin rejects callers who are not administrators.
//
// The console has two sides — the admin console for SUPER_ADMIN, the user
// portal for everyone else — but both are served by one API, and a plain
// forwarding user holds a perfectly valid token against it. Which side an
// account is routed to is therefore a convenience, not a boundary; this is the
// boundary, and it lives in the route table so that reading
// `api/admin_route.go` tells you which endpoints belong to which side.
//
// Must be mounted after Jwt(), which is what puts the principal on the
// context.
func SuperAdmin() app.HandlerFunc {
	return func(c context.Context, ctx *app.RequestContext) {
		if !identity.FromContext(c).IsSuperAdmin() {
			handler.Resp.Err(ctx, 403, "需要管理员权限")
			ctx.Abort()
			return
		}
		ctx.Next(c)
	}
}
