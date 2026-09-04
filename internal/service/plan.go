package service

import (
	"context"
	"time"

	"github.com/lvgj-stack/stander/internal/model/dal"
	"github.com/lvgj-stack/stander/internal/model/entity"
	"github.com/lvgj-stack/stander/internal/service/req"
	"github.com/lvgj-stack/stander/internal/service/resp"
)

// AssociatePlan attaches a traffic plan to a user and moves the expiry and
// traffic-reset marks forward by the plan's period.
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

func ListPlans(ctx context.Context, r *req.ListPlansReq) (*resp.ListPlansResp, error) {

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
