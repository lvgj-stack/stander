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
//
// Administrators only. Both the user and the plan come from the request, so
// without this any account could hand itself the largest plan in the table
// along with a fresh expiry — which is the one thing the whole subscription
// model rests on. The admin console reaches it through 转发用户 › 关联套餐, and
// handler.User.Add calls it in-process while creating an account, both of
// which already run as an administrator.
func AssociatePlan(ctx context.Context, r *req.AssociatePlanReq) (*resp.EmptyResp, error) {
	if err := requireSuperAdmin(ctx); err != nil {
		return nil, err
	}

	plan, err := dal.TrafficPlan.WithContext(ctx).Where(dal.TrafficPlan.ID.Eq(r.PlanId)).First()
	if err != nil {
		return nil, err
	}
	from := PlanPeriodEnd(time.Now(), plan.Period)
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

// ListPlans returns every traffic plan. Administrators only — this is the
// 流量套餐 screen's data, and a user learns their own plan from
// GetUserPlanInfo rather than from the catalogue.
func ListPlans(ctx context.Context, r *req.ListPlansReq) (*resp.ListPlansResp, error) {
	if err := requireSuperAdmin(ctx); err != nil {
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

// PlanPeriodEnd returns when a plan taken out at `from` runs out, which is
// also when its traffic allowance resets.
//
// Exported because account creation needs the same arithmetic inside its own
// transaction: it used to call AssociatePlan after committing the new account,
// which meant a plan lookup failure reported an error over an account that
// already existed.
//
// A NULL period yields `from` unchanged rather than panicking. The column is
// nullable and the old inline version dereferenced it.
func PlanPeriodEnd(from time.Time, period *int32) time.Time {
	if period == nil {
		return from
	}
	switch entity.PlanPeriod(*period) {
	case entity.Month:
		return from.AddDate(0, 1, 0)
	case entity.Quarter:
		return from.AddDate(0, 3, 0)
	case entity.HalfYear:
		return from.AddDate(0, 6, 0)
	case entity.Year:
		return from.AddDate(1, 0, 0)
	}
	return from
}
