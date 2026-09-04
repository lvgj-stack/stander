package api

import (
	"context"
	"net/http"
	"testing"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/ut"
	"github.com/cloudwego/hertz/pkg/protocol/consts"

	"github.com/lvgj-stack/stander/internal/common"
	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/identity"
)

// The service layer reads the caller from the standard context.Context, so the
// middleware that translates transport credentials into an identity.Principal
// is load-bearing: if it silently stops populating the context, every
// permission check quietly degrades to "no user, no role" instead of failing
// loudly. These tests pin that translation.

// probe mounts the production middleware in front of a handler that records
// whichever principal reached it.
func probe(t *testing.T, mw app.HandlerFunc) (*server.Hertz, *identity.Principal) {
	t.Helper()
	var seen identity.Principal
	h := server.New(server.WithHostPorts(":0"))
	h.POST("/probe", mw, func(c context.Context, ctx *app.RequestContext) {
		seen = identity.FromContext(c)
		ctx.JSON(consts.StatusOK, map[string]any{})
	})
	return h, &seen
}

func TestControllerHeadersBecomePrincipal(t *testing.T) {
	h, seen := probe(t, ControllerIdentity())

	ut.PerformRequest(h.Engine, http.MethodPost, "/probe", nil,
		ut.Header{Key: common.HeaderUserKey, Value: "42"},
		ut.Header{Key: common.HeaderRoleKey, Value: identity.RoleSuperAdmin})

	if seen.UserID != 42 {
		t.Errorf("UserID = %d, want 42", seen.UserID)
	}
	if !seen.IsSuperAdmin() {
		t.Errorf("RoleCode = %q, want the caller to be super admin", seen.RoleCode)
	}
}

// A caller with no identity headers must arrive as the zero principal, which
// passes no permission check — not as an accidental super admin.
func TestControllerWithoutHeadersIsUnprivileged(t *testing.T) {
	h, seen := probe(t, ControllerIdentity())

	ut.PerformRequest(h.Engine, http.MethodPost, "/probe", nil)

	if seen.UserID != 0 || seen.RoleCode != "" {
		t.Errorf("got %+v, want the zero principal", *seen)
	}
	if seen.IsSuperAdmin() {
		t.Error("a caller with no headers must not be super admin")
	}
}

// A non-numeric X-User-Id must not be read as some other user.
func TestControllerRejectsGarbageUserID(t *testing.T) {
	h, seen := probe(t, ControllerIdentity())

	ut.PerformRequest(h.Engine, http.MethodPost, "/probe", nil,
		ut.Header{Key: common.HeaderUserKey, Value: "not-a-number"},
		ut.Header{Key: common.HeaderRoleKey, Value: "USER"})

	if seen.UserID != 0 {
		t.Errorf("UserID = %d, want 0 for an unparseable header", seen.UserID)
	}
}

// An agent authenticates with a node key, not a user identity.
func TestAgentKeyBecomesPrincipal(t *testing.T) {
	config.SetConfig(&config.Config{
		Server: &config.Server{},
		Agent:  &config.Agent{NodeKey: "the-node-key"},
	})

	h, seen := probe(t, AgentAuth())

	ut.PerformRequest(h.Engine, http.MethodPost, "/probe", nil,
		ut.Header{Key: common.KeyHeader, Value: "the-node-key"})

	if seen.NodeKey != "the-node-key" {
		t.Errorf("NodeKey = %q, want the-node-key", seen.NodeKey)
	}
	if seen.IsSuperAdmin() {
		t.Error("a node key must not confer super admin")
	}
}
