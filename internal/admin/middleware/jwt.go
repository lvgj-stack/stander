package middleware

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/lvgj-stack/stander/internal/admin/handler"
	"github.com/lvgj-stack/stander/internal/apperr"
	"github.com/lvgj-stack/stander/internal/identity"
	"github.com/lvgj-stack/stander/internal/utils"
)

// Jwt authenticates the admin console's requests.
//
// Besides the "uid"/"roleId" keys the admin handlers read, it also populates the
// keys the stander service layer expects (common.HeaderUserKey /
// common.HeaderRoleKey). Those used to arrive as X-User-Id / X-Role-Id headers
// on the internal HTTP hop; now that admin calls the service layer in-process,
// this middleware is what carries the caller's identity across.
func Jwt() app.HandlerFunc {
	return func(c context.Context, ctx *app.RequestContext) {
		token := string(ctx.GetHeader("Authorization"))
		if token == "" {
			handler.Resp.Fail(c, ctx, apperr.Unauthorizedf("请求未携带 token，无权限访问"))
			ctx.Abort()
			return
		}
		if len(token) > 7 && token[:7] == "Bearer " {
			token = token[7:]
		}

		claims, err := utils.NewJWT().ParseToken(token)
		if err != nil {
			if err == utils.TokenExpired {
				handler.Resp.Fail(c, ctx, apperr.Unauthorizedf("授权已过期"))
			} else {
				handler.Resp.Fail(c, ctx, apperr.Unauthorizedf("登录态无效: %w", err))
			}
			ctx.Abort()
			return
		}

		// The admin handlers still read these off the request context.
		ctx.Set("uid", claims.UID)
		ctx.Set("roleId", claims.CurrentRoleCode)
		ctx.Set("jwt_token", claims)

		// The service layer reads the caller off the standard context instead.
		ctx.Next(identity.NewContext(c, identity.Principal{
			UserID:   int32(claims.UID),
			RoleCode: claims.CurrentRoleCode,
		}))
	}
}
