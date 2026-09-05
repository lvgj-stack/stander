package handler

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/lvgj-stack/stander/internal/service"
)

var StanderUser = &standerUser{}

type standerUser struct{}

func (standerUser) Handle(c context.Context, ctx *app.RequestContext) {
	action := ctx.Query("Action")
	switch action {
	case "GetUserPlanInfo":
		res, err := call(c, ctx, service.GetUserPlanInfo)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	case "ListUsers":
		res, err := call(c, ctx, service.ListUsers)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, map[string]any{
			"pageData": res.Users,
			"total":    res.TotalCount,
		})
	case "GetUserResources":
		res, err := call(c, ctx, service.GetUserResources)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	case "SetUserResources":
		if _, err := call(c, ctx, service.SetUserResources); err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, nil)
	case "EditUser":
		if _, err := call(c, ctx, service.EditUser); err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, nil)
	default:
		unknownAction(ctx, action)
	}
}
