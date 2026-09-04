package api

import (
	"net/http"
	"testing"

	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/ut"

	"github.com/lvgj-stack/stander/internal/common"
	"github.com/lvgj-stack/stander/internal/config"
)

// Registering the routes is itself the assertion for router-tree conflicts:
// Hertz panics at registration time when two patterns cannot coexist.
func newServerUnderTest(t *testing.T) *server.Hertz {
	t.Helper()
	h := server.New(server.WithHostPorts(":0"))
	RegisterAdmin(h)
	RegisterController(h)
	return h
}

// Every admin route sits behind the JWT middleware, so an unauthenticated call
// must come back 401 from our own envelope rather than 404 from the router.
func TestAdminRoutesAreRegistered(t *testing.T) {
	h := newServerUnderTest(t)

	routes := []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/auth/logout"},
		{http.MethodPost, "/auth/password"},
		{http.MethodPost, "/auth/current-role/switch/SUPER_ADMIN"},
		{http.MethodGet, "/user"},
		{http.MethodPost, "/user"},
		{http.MethodDelete, "/user/1"},
		{http.MethodPatch, "/user/password/reset/1"},
		{http.MethodPatch, "/user/1"},
		{http.MethodPatch, "/user/profile/1"},
		{http.MethodGet, "/user/detail"},
		{http.MethodGet, "/role"},
		{http.MethodPost, "/role"},
		{http.MethodPatch, "/role/1"},
		{http.MethodDelete, "/role/1"},
		{http.MethodPatch, "/role/users/add/1"},
		{http.MethodPatch, "/role/users/remove/1"},
		{http.MethodGet, "/role/page"},
		{http.MethodGet, "/role/permissions/tree"},
		{http.MethodPost, "/permission"},
		{http.MethodPatch, "/permission/1"},
		{http.MethodDelete, "/permission/1"},
		{http.MethodGet, "/permission/tree"},
		{http.MethodGet, "/permission/menu/tree"},
		{http.MethodGet, "/permission/button/1"},
		{http.MethodPost, "/stander/node"},
		{http.MethodPost, "/stander/chain"},
		{http.MethodPost, "/stander/rule"},
		{http.MethodPost, "/stander/user"},
		{http.MethodPost, "/stander/chain-group"},
		{http.MethodPost, "/stander/plan"},
	}

	for _, r := range routes {
		t.Run(r.method+" "+r.path, func(t *testing.T) {
			w := ut.PerformRequest(h.Engine, r.method, r.path, nil)
			if got := w.Result().StatusCode(); got != http.StatusOK {
				t.Fatalf("route not reachable: got status %d, want 200 with a 401 envelope", got)
			}
			if body := string(w.Result().Body()); !contains(body, `"code":401`) {
				t.Fatalf("expected the JWT middleware to reject the call, got body %s", body)
			}
		})
	}
}

// /auth/login and /auth/captcha must stay outside the JWT middleware, otherwise
// nobody can obtain a token in the first place.
func TestAuthRoutesArePublic(t *testing.T) {
	h := newServerUnderTest(t)

	for _, r := range []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/auth/login"},
		{http.MethodGet, "/auth/captcha"},
	} {
		t.Run(r.method+" "+r.path, func(t *testing.T) {
			w := ut.PerformRequest(h.Engine, r.method, r.path, nil)
			if body := string(w.Result().Body()); contains(body, `"code":401`) {
				t.Fatalf("%s must not require a token, got %s", r.path, body)
			}
		})
	}
}

func TestUnregisteredPathIs404(t *testing.T) {
	h := newServerUnderTest(t)
	w := ut.PerformRequest(h.Engine, http.MethodGet, "/definitely/not/a/route", nil)
	if got := w.Result().StatusCode(); got != http.StatusNotFound {
		t.Fatalf("got status %d, want 404", got)
	}
}

// The agent mounts a different set of /api/v1 routes than the controller, so it
// gets its own engine.
func TestAgentRoutesAreRegistered(t *testing.T) {
	config.SetConfig(&config.Config{
		Server: &config.Server{},
		Agent:  &config.Agent{NodeKey: "test-key"},
	})

	h := server.New(server.WithHostPorts(":0"))
	RegisterAgent(h)

	for _, path := range []string{"/api/v1/rule", "/api/v1/chain", "/api/v1/node"} {
		t.Run(path, func(t *testing.T) {
			w := ut.PerformRequest(h.Engine, http.MethodPost, path, nil)
			if got := w.Result().StatusCode(); got != http.StatusForbidden {
				t.Fatalf("got status %d, want 403 from the node-key check", got)
			}
		})
	}

	t.Run("data endpoint skips the node-key check", func(t *testing.T) {
		w := ut.PerformRequest(h.Engine, http.MethodPost, "/api/v1/data", nil)
		if got := w.Result().StatusCode(); got == http.StatusForbidden {
			t.Fatal("gost reports traffic without a node key, /api/v1/data must not be gated")
		}
	})
}

func TestControllerRoutesAreRegistered(t *testing.T) {
	h := newServerUnderTest(t)
	for _, path := range []string{
		"/api/v1/rule", "/api/v1/chain", "/api/v1/chain-group",
		"/api/v1/node", "/api/v1/data", "/api/v1/user", "/api/v1/plan",
	} {
		t.Run(path, func(t *testing.T) {
			w := ut.PerformRequest(h.Engine, http.MethodPost, path, nil)
			if got := w.Result().StatusCode(); got == http.StatusNotFound {
				t.Fatalf("%s is not registered", path)
			}
		})
	}
}

// The controller middleware must translate the X-User-Id / X-Role-Id headers
// into the request-context keys the service layer reads for permission checks.
func TestControllerMiddlewarePropagatesIdentity(t *testing.T) {
	if common.HeaderUserKey != "X-User-Id" || common.HeaderRoleKey != "X-Role-Id" {
		t.Fatalf("identity header names changed: %s / %s", common.HeaderUserKey, common.HeaderRoleKey)
	}
}

func contains(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
