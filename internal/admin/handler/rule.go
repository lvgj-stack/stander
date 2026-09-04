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
		res, err := service.ListRule(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, map[string]interface{}{
			"pageData": res.Rules,
			"total":    res.TotalCount,
		})
	case "AddRule":
		res, err := service.AddRule(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	case "DeleteRule":
		res, err := service.DelRule(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	case "ModifyRule":
		res, err := service.ModifyRule(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	case "TestRule":
		res, err := service.TestRule(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	default:
		unknownAction(ctx, action)
	}
}
