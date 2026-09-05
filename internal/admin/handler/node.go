package handler

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/lvgj-stack/stander/internal/service"
	"github.com/lvgj-stack/stander/internal/service/req"
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
		res, err := call(c, ctx, service.ListNode)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, map[string]interface{}{
			"pageData": res.Nodes,
			"total":    res.TotalCount,
		})
	case "AddNode":
		res, err := call(c, ctx, service.AddNode)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res.Key)
	case "DeleteNode":
		res, err := call(c, ctx, service.DelNode)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res.ID)
	case "EditNode":
		if _, err := call(c, ctx, service.EditNode); err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, nil)
	case "ListNodeChainRelationShips":
		res, err := call(c, ctx, service.ListNodeChainRelationShips)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res.Chains)
	case "GetAgentInstallInfo":
		// Also needs the Host the console was reached at, which is a transport
		// fact rather than part of the request body — see the service comment.
		var r req.EmptyReq
		if err := ctx.BindAndValidate(&r); err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		res, err := service.GetAgentInstallInfo(c, &r, string(ctx.Request.Host()))
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	case "GetNodePermissions":
		res, err := call(c, ctx, service.GetNodePermissions)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	default:
		unknownAction(ctx, action)
	}
}
