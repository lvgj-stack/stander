package api

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

// Prober reports whether a dependency is usable. It is satisfied by
// internal/db, kept as an interface so the health routes can be tested without
// a database.
type Prober interface {
	Ping(ctx context.Context) error
}

// RegisterHealth mounts the Kubernetes probe endpoints.
//
//	/healthz  liveness  — the process is running. Never touches a dependency:
//	                      a database outage must not get every pod restarted.
//	/readyz   readiness — the process can serve traffic, i.e. the database
//	                      answers. A failing pod is pulled out of the Service
//	                      until it recovers.
func RegisterHealth(h *server.Hertz, db Prober) {
	h.GET("/healthz", func(c context.Context, ctx *app.RequestContext) {
		ctx.JSON(consts.StatusOK, map[string]string{"status": "ok"})
	})

	h.GET("/readyz", func(c context.Context, ctx *app.RequestContext) {
		if db == nil {
			ctx.JSON(consts.StatusServiceUnavailable, map[string]string{
				"status": "not ready",
				"reason": "database not initialised",
			})
			return
		}
		if err := db.Ping(c); err != nil {
			ctx.JSON(consts.StatusServiceUnavailable, map[string]string{
				"status": "not ready",
				"reason": err.Error(),
			})
			return
		}
		ctx.JSON(consts.StatusOK, map[string]string{"status": "ready"})
	})
}
