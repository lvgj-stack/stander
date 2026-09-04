package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/ut"
)

type stubProber struct{ err error }

func (s stubProber) Ping(context.Context) error { return s.err }

func healthServer(t *testing.T, db Prober) *server.Hertz {
	t.Helper()
	h := server.New(server.WithHostPorts(":0"))
	RegisterHealth(h, db)
	return h
}

// Liveness must not depend on the database. If it did, a database outage would
// fail every pod's liveness probe and Kubernetes would restart the entire
// deployment in a loop while the database was already the thing that was down.
func TestLivenessIgnoresDatabase(t *testing.T) {
	h := healthServer(t, stubProber{err: errors.New("database is down")})

	w := ut.PerformRequest(h.Engine, http.MethodGet, "/healthz", nil)
	if got := w.Result().StatusCode(); got != http.StatusOK {
		t.Fatalf("/healthz = %d, want 200 even with the database down", got)
	}
}

func TestReadinessOKWhenDatabaseAnswers(t *testing.T) {
	h := healthServer(t, stubProber{})

	w := ut.PerformRequest(h.Engine, http.MethodGet, "/readyz", nil)
	if got := w.Result().StatusCode(); got != http.StatusOK {
		t.Fatalf("/readyz = %d, want 200", got)
	}
}

// A pod that cannot reach the database must leave the Service rather than
// accept traffic it will only fail.
func TestReadinessFailsWhenDatabaseIsDown(t *testing.T) {
	h := healthServer(t, stubProber{err: errors.New("connection refused")})

	w := ut.PerformRequest(h.Engine, http.MethodGet, "/readyz", nil)
	if got := w.Result().StatusCode(); got != http.StatusServiceUnavailable {
		t.Fatalf("/readyz = %d, want 503", got)
	}
	if body := string(w.Result().Body()); !strings.Contains(body, "connection refused") {
		t.Errorf("the reason should reach the probe output, got %s", body)
	}
}

// The agent has no database; its readiness must report not-ready rather than
// panic on a nil prober.
func TestReadinessWithNoProber(t *testing.T) {
	h := healthServer(t, nil)

	w := ut.PerformRequest(h.Engine, http.MethodGet, "/readyz", nil)
	if got := w.Result().StatusCode(); got != http.StatusServiceUnavailable {
		t.Fatalf("/readyz = %d, want 503", got)
	}
}
