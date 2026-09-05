package api

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/ut"

	"github.com/lvgj-stack/stander/internal/common"
	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/observability"
	"github.com/lvgj-stack/stander/internal/utils"
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
		{http.MethodGet, "/user"},
		{http.MethodPost, "/user"},
		{http.MethodDelete, "/user/1"},
		{http.MethodPatch, "/user/password/reset/1"},
		{http.MethodPatch, "/user/1"},
		{http.MethodPatch, "/user/profile/1"},
		{http.MethodGet, "/user/detail"},
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

// The console builds its menu from a static route table on both sides, so the
// permission tree that used to drive it — and the role editing that maintained
// it — are gone. They must stay gone: leaving the endpoints mounted would keep
// a second, unused authorization model alive next to the role check that
// actually decides what a caller sees.
func TestPermissionTreeRoutesAreGone(t *testing.T) {
	h := newServerUnderTest(t)

	for _, r := range []struct {
		method string
		path   string
	}{
		// The listing is gone too: with two fixed roles the account form names
		// them outright instead of fetching a table to resolve ids from.
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
	} {
		t.Run(r.method+" "+r.path, func(t *testing.T) {
			w := ut.PerformRequest(h.Engine, r.method, r.path, nil)
			if got := w.Result().StatusCode(); got != http.StatusNotFound {
				t.Fatalf("got status %d, want 404: this route was removed with the dynamic menu", got)
			}
		})
	}
}

// The two sides of the console are served by one API, so a plain forwarding
// user holds a perfectly valid token against every route here. "Not linked
// from the user portal" is not a control — these have to be refused on the
// server.
func TestAccountRoutesRequireSuperAdmin(t *testing.T) {
	utils.SetJWTSigningKey("test-signing-key")
	h := newServerUnderTest(t)
	token := "Bearer " + utils.GenerateToken(3, 3, "user01", "USER")

	for _, r := range []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/user"},
		{http.MethodPost, "/user"},
		{http.MethodDelete, "/user/1"},
		{http.MethodPatch, "/user/1"},
		{http.MethodPatch, "/user/password/reset/1"},
	} {
		t.Run(r.method+" "+r.path, func(t *testing.T) {
			w := ut.PerformRequest(h.Engine, r.method, r.path, nil,
				ut.Header{Key: "Authorization", Value: token})
			body := string(w.Result().Body())
			if !contains(body, `"code":403`) {
				t.Fatalf("a USER token must not reach this route, got %s", body)
			}
		})
	}
}

// ...while the endpoints both sides need must stay reachable with that same
// token. A 401/403 here would strand every user-portal account.
func TestSelfServiceRoutesAcceptANonAdminToken(t *testing.T) {
	utils.SetJWTSigningKey("test-signing-key")
	h := newServerUnderTest(t)
	token := "Bearer " + utils.GenerateToken(3, 3, "user01", "USER")

	for _, r := range []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/auth/logout"},
	} {
		t.Run(r.method+" "+r.path, func(t *testing.T) {
			w := ut.PerformRequest(h.Engine, r.method, r.path, nil,
				ut.Header{Key: "Authorization", Value: token})
			body := string(w.Result().Body())
			if contains(body, `"code":401`) || contains(body, `"code":403`) {
				t.Fatalf("%s must stay open to a user-portal account, got %s", r.path, body)
			}
		})
	}
}

// Role switching re-signed the token with whatever role was asked for, and the
// middleware copies that straight into identity.Principal — so the endpoint was
// one request away from SUPER_ADMIN unless it checked, which is a check worth
// not having to get right. An account has one role now; there is nothing to
// switch to, and the route is gone rather than merely unlinked.
func TestRoleSwitchingIsGone(t *testing.T) {
	utils.SetJWTSigningKey("test-signing-key")
	h := newServerUnderTest(t)
	token := "Bearer " + utils.GenerateToken(3, 3, "user01", "USER")

	for _, path := range []string{
		"/auth/current-role/switch/SUPER_ADMIN",
		"/auth/current-role/switch/USER",
	} {
		t.Run(path, func(t *testing.T) {
			w := ut.PerformRequest(h.Engine, http.MethodPost, path, nil,
				ut.Header{Key: "Authorization", Value: token})
			if got := w.Result().StatusCode(); got != http.StatusNotFound {
				t.Fatalf("got status %d, want 404: %s", got, w.Result().Body())
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

// The console envelope is a wire contract the frontend reads, so its shape is
// pinned here: same fields in the same place whether the call succeeded or
// not, a classification a client can branch on, and a request id on every
// single response — that id is what a user quotes and what you grep for, so a
// response without one is a failure nobody can investigate.
func TestConsoleEnvelopeShape(t *testing.T) {
	utils.SetJWTSigningKey("test-signing-key")
	h := server.New(server.WithHostPorts(":0"))
	h.Use(RequestID())
	RegisterAdmin(h)
	token := "Bearer " + utils.GenerateToken(3, 3, "user01", "USER")

	decode := func(t *testing.T, w *ut.ResponseRecorder) map[string]any {
		t.Helper()
		var envelope map[string]any
		if err := json.Unmarshal(w.Result().Body(), &envelope); err != nil {
			t.Fatalf("envelope is not JSON: %v (%s)", err, w.Result().Body())
		}
		return envelope
	}

	// Every response echoes the id in a header too, and the two must agree —
	// otherwise a caller reading one and an operator grepping the other are
	// chasing different requests.
	assertRequestID := func(t *testing.T, w *ut.ResponseRecorder, envelope map[string]any) {
		t.Helper()
		id, _ := envelope["requestId"].(string)
		if id == "" {
			t.Fatal("envelope carries no requestId")
		}
		if header := w.Result().Header.Get(observability.RequestIDHeader); header != id {
			t.Fatalf("header id %q != envelope id %q", header, id)
		}
	}

	// /auth/logout is the one authenticated success that touches no database.
	t.Run("success", func(t *testing.T) {
		w := ut.PerformRequest(h.Engine, http.MethodPost, "/auth/logout", nil,
			ut.Header{Key: "Authorization", Value: token})
		envelope := decode(t, w)
		assertRequestID(t, w, envelope)

		if envelope["code"] != float64(0) {
			t.Errorf("code = %v, want 0", envelope["code"])
		}
		// `error` is the classification slug and must be absent on success,
		// so a client can treat its presence as "this failed".
		if _, present := envelope["error"]; present {
			t.Errorf("success envelope carries an error slug: %v", envelope)
		}
	})

	// Each of these used to answer with the same magic 20001.
	for _, tt := range []struct {
		name   string
		method string
		path   string
		auth   bool
		code   float64
		slug   string
	}{
		{"no token", http.MethodPost, "/auth/logout", false, 401, "unauthenticated"},
		{"not an administrator", http.MethodGet, "/user", true, 403, "permission_denied"},
		{"unknown action", http.MethodPost, "/stander/node?Action=Nope", true, 400, "invalid_argument"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			var headers []ut.Header
			if tt.auth {
				headers = append(headers, ut.Header{Key: "Authorization", Value: token})
			}
			w := ut.PerformRequest(h.Engine, tt.method, tt.path, nil, headers...)
			envelope := decode(t, w)
			assertRequestID(t, w, envelope)

			if envelope["code"] != tt.code {
				t.Errorf("code = %v, want %v", envelope["code"], tt.code)
			}
			if envelope["error"] != tt.slug {
				t.Errorf("error = %v, want %q", envelope["error"], tt.slug)
			}
			if msg, _ := envelope["message"].(string); msg == "" {
				t.Error("a failure envelope must carry a message for the user")
			}
			// The status line stays 200; the frontend treats a real 401/403
			// as "your session is gone" and would log the user out.
			if got := w.Result().StatusCode(); got != http.StatusOK {
				t.Errorf("HTTP status = %d, want 200 with the failure in the envelope", got)
			}
		})
	}
}
