package middleware

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/lvgj-stack/stander/internal/admin/handler"
	"github.com/lvgj-stack/stander/internal/common"
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
			handler.Resp.Err(ctx, 401, "请求未携带token，无权限访问")
			ctx.Abort()
			return
		}
		if len(token) > 7 && token[:7] == "Bearer " {
			token = token[7:]
		}

		claims, err := utils.NewJWT().ParseToken(token)
		if err != nil {
			if err == utils.TokenExpired {
				handler.Resp.Err(ctx, 401, "授权已过期")
			} else {
				handler.Resp.Err(ctx, 401, err.Error())
			}
			ctx.Abort()
			return
		}

		ctx.Set("uid", claims.UID)
		ctx.Set("roleId", claims.CurrentRoleCode)
		ctx.Set("jwt_token", claims)

		ctx.Set(common.HeaderUserKey, int32(claims.UID))
		ctx.Set(common.HeaderRoleKey, claims.CurrentRoleCode)

		ctx.Next(c)
	}
}
