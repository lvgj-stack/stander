package handler

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/lvgj-stack/stander/internal/service"
)

var Plan = &plan{}

type plan struct{}

func (plan) Handle(c context.Context, ctx *app.RequestContext) {
	action := ctx.Query("Action")
	switch action {
	case "ListPlans":
		res, err := call(c, ctx, service.ListPlans)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	case "AssociatePlan":
		res, err := call(c, ctx, service.AssociatePlan)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	default:
		unknownAction(ctx, action)
	}
}
