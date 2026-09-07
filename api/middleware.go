package api

import (
	"context"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/hlog"

	"github.com/lvgj-stack/stander/internal/observability"
)

// RequestID gives every request an id and echoes it back.
//
// An inbound X-Request-Id is honoured so a caller's own logs line up with
// ours; anything missing or malformed gets a fresh one (see
// observability.SanitizeRequestID — the header is attacker-controlled and ends
// up in log lines and a response header).
//
// The id goes three places: the standard context, so anything downstream can
// read it; the Hertz context, so the envelope writers can; and the response
// header, so it is available even for the responses that carry no envelope —
// /metrics, a panic — which are exactly the ones where you most need to find
// the request in the log.
func RequestID() app.HandlerFunc {
	return func(c context.Context, ctx *app.RequestContext) {
		id := observability.SanitizeRequestID(string(ctx.GetHeader(observability.RequestIDHeader)))
		ctx.Set(observability.RequestIDCtxKey, id)
		ctx.Header(observability.RequestIDHeader, id)
		ctx.Next(observability.NewRequestIDContext(c, id))
	}
}

// requestIDOf reads the id back off the Hertz context.
//
// It is stored there as well as on the standard context because the envelope
// writers are handed only *app.RequestContext; threading a context.Context
// through every one of them would have touched every handler for no gain.
func requestIDOf(ctx *app.RequestContext) string {
	id, _ := ctx.Get(observability.RequestIDCtxKey)
	s, _ := id.(string)
	return s
}

// AccessLog logs one line per request, including the request id.
//
// It replaces hertz-contrib's accesslog, which had no way to include the id —
// and an id that appears only in the response is useless, because the whole
// point is to find the matching line in the log.
//
// The route pattern is logged rather than the URL for the same reason the
// metrics middleware labels by pattern: "/user/:id" is one thing you can
// search for, "/user/431" is not.
func AccessLog() app.HandlerFunc {
	return func(c context.Context, ctx *app.RequestContext) {
		start := time.Now()
		ctx.Next(c)

		route := ctx.FullPath()
		if route == "" {
			route = "unmatched"
		}
		// Action-dispatched endpoints are all one route, so the verb has to
		// come from the query string or every /stander/* line looks alike.
		if action := ctx.Query("Action"); action != "" {
			route += "?Action=" + action
		}

		status := ctx.Response.StatusCode()
		line := "request_id=%s status=%d latency=%s method=%s route=%s path=%s client_ip=%s"
		args := []any{
			requestIDOf(ctx), status, time.Since(start).Round(time.Microsecond),
			string(ctx.Method()), route, string(ctx.Path()), ctx.ClientIP(),
		}
		if status >= 500 {
			hlog.CtxErrorf(c, line, args...)
			return
		}
		hlog.CtxInfof(c, line, args...)
	}
}
