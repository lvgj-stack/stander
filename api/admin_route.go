package api

import (
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/hertz-contrib/cors"
	"github.com/hertz-contrib/sessions"
	"github.com/hertz-contrib/sessions/cookie"

	"github.com/lvgj-stack/stander/internal/admin/handler"
	"github.com/lvgj-stack/stander/internal/admin/middleware"
)

// RegisterAdmin mounts the admin console API at the root of h.
func RegisterAdmin(h *server.Hertz) {
	// The session only carries the captcha id between /auth/captcha and /auth/login.
	h.Use(sessions.New("mysession", cookie.NewStore([]byte("captch"))))
	h.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	h.POST("/auth/login", handler.Auth.Login)
	h.GET("/auth/captcha", handler.Auth.Captcha)

	authed := h.Group("", middleware.Jwt())

	authed.POST("/auth/logout", handler.Auth.Logout)
	// Pre-merge this pointed at Auth.Logout while the real handler was
	// unexported and unreachable, so changing a password silently did nothing.
	authed.POST("/auth/password", handler.Auth.Password)
	authed.POST("/auth/current-role/switch/:role", handler.Auth.SwitchRole)

	authed.GET("/user", handler.User.List)
	authed.POST("/user", handler.User.Add)
	authed.DELETE("/user/:id", handler.User.Delete)
	authed.PATCH("/user/password/reset/:id", handler.User.Update)
	authed.PATCH("/user/:id", handler.User.Update)
	authed.PATCH("/user/profile/:id", handler.User.Profile)
	authed.GET("/user/detail", handler.User.Detail)

	authed.GET("/role", handler.Role.List)
	authed.POST("/role", handler.Role.Add)
	authed.PATCH("/role/:id", handler.Role.Update)
	authed.DELETE("/role/:id", handler.Role.Delete)
	authed.PATCH("/role/users/add/:id", handler.Role.AddUser)
	authed.PATCH("/role/users/remove/:id", handler.Role.RemoveUser)
	authed.GET("/role/page", handler.Role.ListPage)
	authed.GET("/role/permissions/tree", handler.Role.PermissionsTree)

	authed.POST("/permission", handler.Permissions.Add)
	authed.PATCH("/permission/:id", handler.Permissions.PatchPermission)
	authed.DELETE("/permission/:id", handler.Permissions.Delete)
	authed.GET("/permission/tree", handler.Permissions.List)
	authed.GET("/permission/menu/tree", handler.Permissions.List)
	authed.GET("/permission/button/:id", handler.Permissions.Button)

	authed.POST("/stander/node", handler.Node.Handle)
	authed.POST("/stander/chain", handler.Chain.Handle)
	authed.POST("/stander/rule", handler.Rule.Handle)
	authed.POST("/stander/user", handler.StanderUser.Handle)
	authed.POST("/stander/chain-group", handler.ChainGroup.Handle)
	authed.POST("/stander/plan", handler.Plan.Handle)
}
