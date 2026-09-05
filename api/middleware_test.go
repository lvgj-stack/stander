package api

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/ut"

	"github.com/lvgj-stack/stander/internal/observability"
)

// serverWithRequestID mounts the middleware the way newHertz does, plus an
// endpoint that reports what the handlers downstream can see.
func serverWithRequestID(t *testing.T) *server.Hertz {
	t.Helper()
	h := server.New(server.WithHostPorts(":0"))
	h.Use(RequestID())
	h.GET("/probe", func(c context.Context, ctx *app.RequestContext) {
		ctx.JSON(http.StatusOK, map[string]any{
			// What a handler reads off the standard context...
			"fromContext": observability.RequestIDFromContext(c),
			// ...and what the envelope writers read off the Hertz context.
			"fromHertz": requestIDOf(ctx),
		})
	})
	return h
}

func TestRequestIDIsAlwaysPresentAndConsistent(t *testing.T) {
	h := serverWithRequestID(t)

	w := ut.PerformRequest(h.Engine, http.MethodGet, "/probe", nil)
	header := w.Result().Header.Get(observability.RequestIDHeader)
	body := string(w.Result().Body())

	if header == "" {
		t.Fatal("every response must echo a request id, including ones with no envelope")
	}
	// The id a handler logs and the id the caller is given have to be the same
	// string, or quoting it finds nothing.
	if !strings.Contains(body, `"fromContext":"`+header+`"`) {
		t.Errorf("the context id differs from the header id: header=%s body=%s", header, body)
	}
	if !strings.Contains(body, `"fromHertz":"`+header+`"`) {
		t.Errorf("the Hertz-context id differs from the header id: header=%s body=%s", header, body)
	}
}

// An inbound id is honoured so a caller's logs line up with ours.
func TestRequestIDHonoursAPlausibleInboundHeader(t *testing.T) {
	h := serverWithRequestID(t)
	const given = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"

	w := ut.PerformRequest(h.Engine, http.MethodGet, "/probe", nil,
		ut.Header{Key: observability.RequestIDHeader, Value: given})

	if got := w.Result().Header.Get(observability.RequestIDHeader); got != given {
		t.Fatalf("inbound id not honoured: got %q, want %q", got, given)
	}
}

// ...but not blindly. The header is attacker-controlled and is written into a
// log line and a response header.
func TestRequestIDRejectsAHostileInboundHeader(t *testing.T) {
	h := serverWithRequestID(t)

	for _, hostile := range []string{
		"abc def",                // whitespace breaks key=value log parsing
		strings.Repeat("a", 200), // unbounded growth in every log line
		"<script>alert(1)</script>",
	} {
		t.Run(hostile[:min(len(hostile), 12)], func(t *testing.T) {
			w := ut.PerformRequest(h.Engine, http.MethodGet, "/probe", nil,
				ut.Header{Key: observability.RequestIDHeader, Value: hostile})

			got := w.Result().Header.Get(observability.RequestIDHeader)
			if got == hostile {
				t.Fatalf("hostile id %q was passed through", hostile)
			}
			if got == "" {
				t.Fatal("a rejected id must still be replaced, not dropped")
			}
		})
	}
}

// Two requests must not share an id, or the whole point is lost.
func TestRequestIDDiffersPerRequest(t *testing.T) {
	h := serverWithRequestID(t)

	first := ut.PerformRequest(h.Engine, http.MethodGet, "/probe", nil).
		Result().Header.Get(observability.RequestIDHeader)
	second := ut.PerformRequest(h.Engine, http.MethodGet, "/probe", nil).
		Result().Header.Get(observability.RequestIDHeader)

	if first == second {
		t.Fatalf("both requests got id %q", first)
	}
}
