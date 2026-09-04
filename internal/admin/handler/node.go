package handler

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/lvgj-stack/stander/internal/service"
)

var Node = &node{}

type node struct{}

// Handle dispatches the admin console's /stander/node actions straight into the
// service layer. Before the monorepo merge this hopped over HTTP to the
// controller; the response envelope the frontend sees is unchanged.
func (node) Handle(c context.Context, ctx *app.RequestContext) {
	action := ctx.Query("Action")
	switch action {
	case "ListNodes":
		res, err := service.ListNode(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, map[string]interface{}{
			"pageData": res.Nodes,
			"total":    res.TotalCount,
		})
	case "AddNode":
		res, err := service.AddNode(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res.Key)
	case "DeleteNode":
		res, err := service.DelNode(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res.ID)
	case "EditNode":
		if _, err := service.EditNode(c, ctx); err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, nil)
	case "ListNodeChainRelationShips":
		res, err := service.ListNodeChainRelationShips(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res.Chains)
	case "GetNodePermissions":
		res, err := service.GetNodePermissions(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	default:
		unknownAction(ctx, action)
	}
}
