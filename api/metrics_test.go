package api

import (
	"context"

	"net/http"
	"strings"
	"testing"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/ut"
)

func TestMetricsEndpointServesPrometheusText(t *testing.T) {
	h := server.New(server.WithHostPorts(":0"))
	RegisterMetrics(h)

	w := ut.PerformRequest(h.Engine, http.MethodGet, "/metrics", nil)
	if got := w.Result().StatusCode(); got != http.StatusOK {
		t.Fatalf("/metrics = %d, want 200", got)
	}
	if body := string(w.Result().Body()); !strings.Contains(body, "go_goroutines") {
		t.Errorf("expected Prometheus exposition output, got %.200q", body)
	}
}

// The route pattern, not the request URL, must become the metric label.
// Labelling by URL would mint a time series per user id.
func TestMetricsLabelsByRoutePatternNotURL(t *testing.T) {
	h := server.New(server.WithHostPorts(":0"))
	h.Use(Metrics())
	RegisterMetrics(h)
	h.GET("/user/:id", func(c context.Context, ctx *app.RequestContext) { ctx.String(200, "ok") })

	ut.PerformRequest(h.Engine, http.MethodGet, "/user/12345", nil)
	ut.PerformRequest(h.Engine, http.MethodGet, "/user/67890", nil)

	body := string(ut.PerformRequest(h.Engine, http.MethodGet, "/metrics", nil).Result().Body())
	if !strings.Contains(body, `path="/user/:id"`) {
		t.Errorf("expected the route pattern as the label, got:\n%s", extractStanderLines(body))
	}
	if strings.Contains(body, `path="/user/12345"`) {
		t.Error("the raw URL must not become a label: that is unbounded cardinality")
	}
}

func extractStanderLines(body string) string {
	var out []string
	for _, line := range strings.Split(body, "\n") {
		if strings.HasPrefix(line, "stander_http_requests_total") {
			out = append(out, line)
		}
	}
	return strings.Join(out, "\n")
}
