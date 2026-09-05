package handler

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/lvgj-stack/stander/internal/service"
)

var Rule = &rule{}

type rule struct{}

func (rule) Handle(c context.Context, ctx *app.RequestContext) {
	action := ctx.Query("Action")
	switch action {
	case "ListRules":
		res, err := call(c, ctx, service.ListRule)
		if err != nil {
			Resp.Fail(c, ctx, err)
			return
		}
		Resp.Succ(ctx, map[string]interface{}{
			"pageData": res.Rules,
			"total":    res.TotalCount,
		})
	case "AddRule":
		res, err := call(c, ctx, service.AddRule)
		if err != nil {
			Resp.Fail(c, ctx, err)
			return
		}
		Resp.Succ(ctx, res)
	case "DeleteRule":
		res, err := call(c, ctx, service.DelRule)
		if err != nil {
			Resp.Fail(c, ctx, err)
			return
		}
		Resp.Succ(ctx, res)
	case "ModifyRule":
		res, err := call(c, ctx, service.ModifyRule)
		if err != nil {
			Resp.Fail(c, ctx, err)
			return
		}
		Resp.Succ(ctx, res)
	case "TestRule":
		res, err := call(c, ctx, service.TestRule)
		if err != nil {
			Resp.Fail(c, ctx, err)
			return
		}
		Resp.Succ(ctx, res)
	default:
		unknownAction(c, ctx, action)
	}
}
