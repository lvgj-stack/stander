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
		res, err := service.GetUserPlanInfo(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, res)
	case "ListUsers":
		res, err := service.ListUsers(c, ctx)
		if err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, map[string]any{
			"pageData": res.Users,
			"total":    res.TotalCount,
		})
	case "EditUser":
		if _, err := service.EditUser(c, ctx); err != nil {
			Resp.Err(ctx, 20001, err.Error())
			return
		}
		Resp.Succ(ctx, nil)
	default:
		unknownAction(ctx, action)
	}
}
