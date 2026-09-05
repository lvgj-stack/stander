package api

import (
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/hertz-contrib/cors"
	"github.com/hertz-contrib/sessions"
	"github.com/hertz-contrib/sessions/cookie"

	"github.com/lvgj-stack/stander/internal/admin/handler"
	"github.com/lvgj-stack/stander/internal/admin/middleware"
)

// RegisterAdmin mounts the console API at the root of h.
//
// It serves both sides of the frontend — the admin console and the user
// portal. Which side a signed-in account gets is decided by its role, not by a
// per-route permission lookup: SUPER_ADMIN gets the admin console, everyone
// else the user portal, and the service layer scopes rows to the caller the
// same way it always has (identity.Principal.IsSuperAdmin).
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

	// Every signed-in account, on either side.
	authed.GET("/user/detail", handler.User.Detail)
	// Editing a profile is self-service; the handler checks the row belongs to
	// the caller.
	authed.PATCH("/user/profile/:id", handler.User.Profile)

	// Administrators only. These manage other people's accounts: without the
	// gate any signed-in user could PATCH themselves a SUPER_ADMIN role, reset
	// somebody's password, or delete an account. A plain forwarding user holds
	// a valid token here — the user portal is served by this same API — so
	// "absent from the user portal's screens" is not a control.
	admin := authed.Group("", middleware.SuperAdmin())
	admin.GET("/user", handler.User.List)
	admin.POST("/user", handler.User.Add)
	admin.DELETE("/user/:id", handler.User.Delete)
	admin.PATCH("/user/password/reset/:id", handler.User.Update)
	admin.PATCH("/user/:id", handler.User.Update)

	// Read-only, and administrators only: the account form uses it to pick
	// which side of the console a user belongs to. Role CRUD and the whole
	// /permission/* tree are gone — the console no longer builds its menu out
	// of permission rows.
	admin.GET("/role", handler.Role.List)

	// The forwarding API. Both sides call these; the service layer scopes each
	// action to the caller (identity.Principal.IsSuperAdmin), so the
	// admin-only actions among them are gated there rather than here.
	authed.POST("/stander/node", handler.Node.Handle)
	authed.POST("/stander/chain", handler.Chain.Handle)
	authed.POST("/stander/rule", handler.Rule.Handle)
	authed.POST("/stander/user", handler.StanderUser.Handle)
	authed.POST("/stander/chain-group", handler.ChainGroup.Handle)
	authed.POST("/stander/plan", handler.Plan.Handle)
}
