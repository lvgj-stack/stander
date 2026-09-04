// Package api registers every HTTP route the stander binary serves. The admin
// console lives at the root, the controller and agent APIs under /api/v1.
package api

import (
	"context"
	"net/http"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"

	"github.com/lvgj-stack/stander/internal/common"
	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/service"
)

// RegisterController mounts the controller API. Agents and gost call it with
// X-User-Id / X-Role-Id headers identifying the acting user.
func RegisterController(h *server.Hertz) {
	api := h.Group("/api/v1")
	api.Use(func(c context.Context, ctx *app.RequestContext) {
		roleId := string(ctx.GetHeader(common.HeaderRoleKey))
		uid, _ := strconv.Atoi(string(ctx.GetHeader(common.HeaderUserKey)))
		ctx.Set(common.HeaderRoleKey, roleId)
		ctx.Set(common.HeaderUserKey, int32(uid))
		ctx.Next(c)
	})
	api.POST("rule", service.RuleSrv)
	api.POST("chain", service.ChainSrv)
	api.POST("chain-group", service.ChainGroupSrv)
	api.POST("node", service.NodeSrv)
	api.POST("data", service.DataSrv)
	api.POST("user", service.UserSrv)
	api.POST("plan", service.PlanSrv)
}

// RegisterAgent mounts the routes an agent node serves.
func RegisterAgent(h *server.Hertz) {
	api := h.Group("/api/v1")
	// gost reports traffic without the node key.
	api.POST("data", service.DataSrv)
	api.Use(func(c context.Context, ctx *app.RequestContext) {
		if string(ctx.GetHeader(common.KeyHeader)) != config.GetKey() {
			ctx.AbortWithStatusJSON(http.StatusForbidden, map[string]any{
				"Error": "request forbidden",
			})
			return
		}
		ctx.Next(c)
	})
	api.POST("rule", service.RuleSrv)
	api.POST("chain", service.ChainSrv)
	api.POST("node", service.NodeSrv)
}
