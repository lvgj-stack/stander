package handler

import (
	"context"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"
)

var Resp = &rps{}

type rps struct {
	Code      int         `json:"code"`
	Message   string      `json:"message"`
	Data      interface{} `json:"data,omitempty"`
	Error     string      `json:"error,omitempty"`
	OriginUrl string      `json:"originUrl"`
}

func (rps) Succ(ctx *app.RequestContext, data interface{}) {
	resp := rps{
		Code:      0,
		Message:   "OK",
		Data:      data,
		OriginUrl: string(ctx.Request.URI().Path()),
	}
	ctx.Set("succ_response", resp)
	ctx.JSON(http.StatusOK, resp)
}

func (rps) Err(ctx *app.RequestContext, errCode int, message string) {
	resp := rps{
		Code:      errCode,
		Error:     "error some",
		Message:   message,
		OriginUrl: string(ctx.Request.URI().Path()),
	}
	ctx.Set("err_response", resp)
	ctx.JSON(http.StatusOK, resp)
}

// unknownAction keeps the previous silent fall-through from returning an empty
// 200, which made typos in the Action query parameter impossible to diagnose.
func unknownAction(ctx *app.RequestContext, action string) {
	Resp.Err(ctx, 20001, "unknown action: "+action)
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
