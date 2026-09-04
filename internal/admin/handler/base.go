package handler

import (
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
