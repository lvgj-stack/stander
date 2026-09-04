package api

import (
	"bytes"
	"context"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/common/expfmt"

	"github.com/lvgj-stack/stander/internal/observability"
)

// RegisterMetrics mounts the Prometheus scrape endpoint.
//
// The exposition is gathered into a buffer and written in one go rather than
// wrapping promhttp with hertz's net/http adaptor: that adaptor streams through
// a chunked writer that needs a live connection, so it cannot be exercised in a
// test and panics under the unit-test harness.
func RegisterMetrics(h *server.Hertz) {
	h.GET("/metrics", func(c context.Context, ctx *app.RequestContext) {
		body, err := gather()
		if err != nil {
			ctx.String(consts.StatusInternalServerError, "gathering metrics: %v", err)
			return
		}
		ctx.Data(consts.StatusOK, string(expfmt.NewFormat(expfmt.TypeTextPlain)), body)
	})
}

func gather() ([]byte, error) {
	families, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	enc := expfmt.NewEncoder(&buf, expfmt.NewFormat(expfmt.TypeTextPlain))
	for _, mf := range families {
		if err := enc.Encode(mf); err != nil {
			return nil, err
		}
	}
	return buf.Bytes(), nil
}

// Metrics records latency and outcome for every request.
//
// It labels by the registered route pattern (ctx.FullPath(), e.g. "/user/:id")
// rather than the request URL. Labelling by URL would create a separate time
// series per user id and eventually take out the Prometheus server.
func Metrics() app.HandlerFunc {
	return func(c context.Context, ctx *app.RequestContext) {
		start := time.Now()
		ctx.Next(c)

		path := ctx.FullPath()
		if path == "" {
			// Unmatched routes share one series instead of one per bad URL.
			path = "<unmatched>"
		}
		observability.ObserveRequest(
			path,
			string(ctx.Request.Method()),
			ctx.Response.StatusCode(),
			time.Since(start),
		)
	}
}
