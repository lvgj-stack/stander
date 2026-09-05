package handler

import (
	"context"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/hlog"

	"github.com/lvgj-stack/stander/internal/apperr"
	"github.com/lvgj-stack/stander/internal/observability"
)

var Resp = &rps{}

// requestIDOf reads the id the RequestID middleware stashed on this request.
func requestIDOf(ctx *app.RequestContext) string {
	id, _ := ctx.Get(observability.RequestIDCtxKey)
	s, _ := id.(string)
	return s
}

// rps writes the console API's response envelope.
//
// Every field is always in the same place whether the call succeeded or not,
// and `requestId` is always present — it is the string a user quotes when
// reporting a failure and the one you grep the logs for.
type rps struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
	// Error is the stable machine-readable classification
	// (apperr.Kind.Slug()), absent on success. It used to be the literal
	// string "error some" on every failure, which told nobody anything.
	Error     string `json:"error,omitempty"`
	RequestID string `json:"requestId"`
	OriginUrl string `json:"originUrl"`
}

func (rps) Succ(ctx *app.RequestContext, data any) {
	resp := rps{
		Code:      0,
		Message:   "OK",
		Data:      data,
		RequestID: requestIDOf(ctx),
		OriginUrl: string(ctx.Request.URI().Path()),
	}
	ctx.Set("succ_response", resp)
	ctx.JSON(http.StatusOK, resp)
}

// Fail writes err as the envelope, having classified and logged it.
//
// This is the only way a handler reports a failure. It replaced 48 call sites
// that all passed the same magic 20001 regardless of what had gone wrong, so a
// client could not distinguish a mistyped port from a database outage.
//
// The caller is shown apperr's message; the wrapped cause is logged, never
// serialised, because that is where SQL text and internal identifiers live.
// The log line carries the request id that also goes back in the envelope, so
// the two can be joined.
//
// The status line stays 200: a business failure has always been reported
// through the envelope on this API, and the frontend treats a real 401/403 as
// "your session is gone" — returning those here would log people out for
// mistyping a form.
func (rps) Fail(c context.Context, ctx *app.RequestContext, err error) {
	e := apperr.From(err)
	id := requestIDOf(ctx)

	if e.Kind.ServerFault() {
		hlog.CtxErrorf(c, "request_id=%s kind=%s path=%s error=%v",
			id, e.Kind.Slug(), string(ctx.Request.URI().Path()), err)
	} else {
		// Not our fault, but still worth a line: this is how you find out that
		// someone has been failing to save a form for ten minutes.
		hlog.CtxInfof(c, "request_id=%s kind=%s path=%s rejected=%q",
			id, e.Kind.Slug(), string(ctx.Request.URI().Path()), e.Message())
	}

	resp := rps{
		Code:      e.Kind.Code(),
		Message:   e.Message(),
		Error:     e.Kind.Slug(),
		RequestID: id,
		OriginUrl: string(ctx.Request.URI().Path()),
	}
	ctx.Set("err_response", resp)
	ctx.JSON(http.StatusOK, resp)
}

// unknownAction keeps the previous silent fall-through from returning an empty
// 200, which made typos in the Action query parameter impossible to diagnose.
func unknownAction(c context.Context, ctx *app.RequestContext, action string) {
	Resp.Fail(c, ctx, apperr.Invalidf("unknown action: %s", action))
}

// deref reads a nullable column from a gorm-gen entity, where every field is a
// pointer, falling back to the zero value for NULL.
func deref[T any](p *T) T {
	if p == nil {
		var zero T
		return zero
	}
	return *p
}

// call binds the request body into T and invokes a service action with it.
//
// The service layer no longer takes a *app.RequestContext, so binding is the
// caller's job. Keeping it in one generic helper means each action case stays a
// single line and the bind error is reported the same way everywhere.
func call[T, R any](c context.Context, ctx *app.RequestContext, action func(context.Context, *T) (R, error)) (R, error) {
	var r T
	if err := ctx.BindAndValidate(&r); err != nil {
		var zero R
		return zero, err
	}
	return action(c, &r)
}
