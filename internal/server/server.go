package server

import (
	"fmt"
	"time"

	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/hlog"
	"github.com/hertz-contrib/logger/accesslog"

	"github.com/lvgj-stack/stander/internal/config"
)

// hertzServer names the concrete server type so serve() reads clearly.
type hertzServer = server.Hertz

// newHertz builds the single Hertz instance every entrypoint runs on.
func newHertz(c *config.Config) *hertzServer {
	h := server.Default(
		server.WithHostPorts(":" + c.Server.Port),
	)
	h.Use(accesslog.New(accesslog.WithTimeZoneLocation(time.Local)))
	hlog.SetLevel(hlog.Level(c.Server.LogLevel))
	return h
}

// applyTimezone pins the process timezone.
//
// Daily traffic is stored in a date column derived from time.Now(), so the
// timezone decides when a day rolls over. A container image carries no
// /etc/localtime and would otherwise run in UTC, silently shifting every
// accounting boundary relative to a host-run binary.
func applyTimezone(name string) error {
	if name == "" {
		return nil
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return fmt.Errorf("load timezone %q: %w", name, err)
	}
	time.Local = loc
	return nil
}
