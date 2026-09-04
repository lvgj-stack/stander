package handler

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/lvgj-stack/stander/internal/service"
)

var ChainGroup = &chainGroup{}

type chainGroup struct{}

// Handle serves /stander/chain-group.
//
// The pre-merge implementation posted every one of these actions to the
// controller's "chain" endpoint, whose dispatcher has no ListChainGroups /
// AddChainGroup / DeleteChainGroup cases, so they all came back "action not
// found". Dispatching in-process fixes that. "EditChain" is kept pointing at
// the chain service to preserve the old (working) behaviour of that one action.
func (chainGroup) Handle(c context.Context, ctx *app.RequestContext) {
	action := ctx.Query("Action")
	switch action {
	case "ListChainGroups":
		res, err := call(c, ctx, service.ListChainGroup)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, map[string]interface{}{
			"pageData": res.ChainGroups,
			"total":    0,
		})
	case "AddChainGroup":
		res, err := call(c, ctx, service.AddChainGroup)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	case "DeleteChainGroup":
		res, err := call(c, ctx, service.DelChainGroup)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	case "EditChainGroup":
		if _, err := call(c, ctx, service.EditChainGroup); err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, nil)
	case "EditChain":
		if _, err := call(c, ctx, service.EditChain); err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, nil)
	default:
		unknownAction(ctx, action)
	}
}
