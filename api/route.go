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
	"github.com/lvgj-stack/stander/internal/identity"
)

// RegisterController mounts the controller API. Agents and gost call it with
// X-User-Id / X-Role-Id headers identifying the acting user.
func RegisterController(h *server.Hertz) {
	api := h.Group("/api/v1")
	api.Use(ControllerIdentity())
	api.POST("rule", ruleSrv)
	api.POST("chain", chainSrv)
	api.POST("chain-group", chainGroupSrv)
	api.POST("node", nodeSrv)
	api.POST("data", dataSrv)
	api.POST("user", userSrv)
	api.POST("plan", planSrv)
}

// RegisterAgent mounts the routes an agent node serves.
func RegisterAgent(h *server.Hertz) {
	api := h.Group("/api/v1")
	// gost reports traffic without the node key.
	api.POST("data", dataSrv)
	api.Use(AgentAuth())
	api.POST("rule", ruleSrv)
	api.POST("chain", chainSrv)
	api.POST("node", nodeSrv)
}

// ControllerIdentity translates the X-User-Id / X-Role-Id headers into an
// identity.Principal on the standard context, which is where the service layer
// reads the caller from.
//
// A missing or unparseable header yields the zero principal rather than an
// error: an anonymous caller passes no permission check anyway, and rejecting
// here would break the agent and gost callbacks, which carry no user identity.
func ControllerIdentity() app.HandlerFunc {
	return func(c context.Context, ctx *app.RequestContext) {
		uid, _ := strconv.Atoi(string(ctx.GetHeader(common.HeaderUserKey)))
		ctx.Next(identity.NewContext(c, identity.Principal{
			UserID:   int32(uid),
			RoleCode: string(ctx.GetHeader(common.HeaderRoleKey)),
		}))
	}
}

// AgentAuth gates the agent API on the node key the controller issued at
// registration, and carries that key on as the caller's identity.
func AgentAuth() app.HandlerFunc {
	return func(c context.Context, ctx *app.RequestContext) {
		key := string(ctx.GetHeader(common.KeyHeader))
		if key != config.GetKey() {
			ctx.AbortWithStatusJSON(http.StatusForbidden, map[string]any{
				"Error": "request forbidden",
			})
			return
		}
		ctx.Next(identity.NewContext(c, identity.Principal{NodeKey: key}))
	}
}
