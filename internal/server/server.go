package server

import (
	"time"

	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/hlog"
	"github.com/hertz-contrib/logger/accesslog"

	"github.com/lvgj-stack/stander/internal/config"
)

// newHertz builds the single Hertz instance every entrypoint runs on.
func newHertz(c *config.Config) *server.Hertz {
	h := server.Default(
		server.WithHostPorts(":" + c.Server.Port),
	)
	if location, err := time.LoadLocation("Asia/Shanghai"); err == nil {
		h.Use(accesslog.New(accesslog.WithTimeZoneLocation(location)))
	}
	hlog.SetLevel(hlog.Level(c.Server.LogLevel))
	return h
}
