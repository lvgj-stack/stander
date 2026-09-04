package handler

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/lvgj-stack/stander/internal/service"
)

var Chain = &chain{}

type chain struct{}

func (chain) Handle(c context.Context, ctx *app.RequestContext) {
	action := ctx.Query("Action")
	switch action {
	case "ListChains":
		res, err := call(c, ctx, service.ListChain)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, map[string]interface{}{
			"pageData": res.Chains,
			"total":    res.TotalCount,
		})
	case "AddChain":
		res, err := call(c, ctx, service.AddChain)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	case "DeleteChain":
		res, err := call(c, ctx, service.DelChain)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	case "EditChain":
		if _, err := call(c, ctx, service.EditChain); err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, nil)
	case "GetChainPermissions":
		res, err := call(c, ctx, service.GetChainPermissions)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	default:
		unknownAction(ctx, action)
	}
}
