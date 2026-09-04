package service

import (
	"context"
	"errors"
	"time"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/lvgj-stack/stander/internal/model/dal"
	"github.com/lvgj-stack/stander/internal/model/entity"
	error2 "github.com/lvgj-stack/stander/internal/service/error"
	"github.com/lvgj-stack/stander/internal/service/req"
	"github.com/lvgj-stack/stander/internal/service/resp"
)

func PlanSrv(c context.Context, ctx *app.RequestContext) {
	action := ctx.Query("Action")
	switch action {
	case "ListPlans":
		resp, err := ListPlans(c, ctx)
		error2.WriteResponse(ctx, err, resp)
	case "AssociatePlan":
		resp, err := AssociatePlans(c, ctx)
		error2.WriteResponse(ctx, err, resp)
	default:
		error2.WriteResponse(ctx, errors.New("action not found"), nil)
	}
}

func AssociatePlans(ctx context.Context, c *app.RequestContext) (*resp.EmptyResp, error) {
	r := req.AssociatePlanReq{}
	if err := c.BindAndValidate(&r); err != nil {
		return nil, err
	}
	return AssociatePlan(ctx, &r)
}

// AssociatePlan is the request-context-free core of AssociatePlans. The admin
// console calls it directly when creating a user, where the plan association is
// derived from the create-user payload rather than from its own request body.
func AssociatePlan(ctx context.Context, r *req.AssociatePlanReq) (*resp.EmptyResp, error) {
	plan, err := dal.TrafficPlan.WithContext(ctx).Where(dal.TrafficPlan.ID.Eq(r.PlanId)).First()
	if err != nil {
		return nil, err
	}
	from := time.Now()
	switch entity.PlanPeriod(*plan.Period) {
	case entity.Month:
		from = from.AddDate(0, 1, 0)
	case entity.Quarter:
		from = from.AddDate(0, 3, 0)
	case entity.HalfYear:
		from = from.AddDate(0, 6, 0)
	case entity.Year:
		from = from.AddDate(1, 0, 0)
	}
	if _, err := dal.User.WithContext(ctx).Where(dal.User.ID.Eq(r.UserId)).Updates(
		&entity.User{
			PlanID:           r.PlanId,
			ExpirationTime:   &from,
			ResetTrafficTime: &from,
		},
	); err != nil {
		return nil, err
	}
	return &resp.EmptyResp{}, nil
}

func ListPlans(ctx context.Context, c *app.RequestContext) (*resp.ListPlansResp, error) {
	r := req.ListPlansReq{}
	if err := c.BindAndValidate(&r); err != nil {
		return nil, err
	}

	plans, err := dal.TrafficPlan.WithContext(ctx).Find()
	if err != nil {
		return nil, err
	}
	planTo := make([]*resp.PlanTo, 0, len(plans))
	for _, plan := range plans {
		planTo = append(planTo, &resp.PlanTo{TrafficPlan: plan})
	}

	return &resp.ListPlansResp{
		Plans: planTo,
	}, nil
}
