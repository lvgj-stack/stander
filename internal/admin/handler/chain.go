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
		res, err := service.ListChain(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, map[string]interface{}{
			"pageData": res.Chains,
			"total":    res.TotalCount,
		})
	case "AddChain":
		res, err := service.AddChain(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	case "DeleteChain":
		res, err := service.DelChain(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	case "EditChain":
		if _, err := service.EditChain(c, ctx); err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, nil)
	case "GetChainPermissions":
		res, err := service.GetChainPermissions(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	default:
		unknownAction(ctx, action)
	}
}
