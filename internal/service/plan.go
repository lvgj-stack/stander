package service

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm/clause"

	"github.com/lvgj-stack/stander/internal/apperr"
	"github.com/lvgj-stack/stander/internal/model/dal"
	"github.com/lvgj-stack/stander/internal/model/entity"
	"github.com/lvgj-stack/stander/internal/service/req"
	"github.com/lvgj-stack/stander/internal/service/resp"
)

// planDraft is a create request that has passed validation: the values that
// will be written, rather than the ones that arrived.
type planDraft struct {
	name    string
	traffic int64
	period  int32
}

// planNameLimit is what the column holds: varchar(255), counted in characters.
//
// Checked here so an over-long name comes back as something the operator can
// fix. Left to the driver it arrives as an unrecognised error, which apperr
// classifies as Internal — 「服务器内部错误」 for a typo, plus an error-level
// line in the log.
const planNameLimit = 255

// validateCreatePlan checks a create request and returns what to store.
//
// The rules live here rather than in `vd:` tags on the request because tags
// only run when hertz binds a request. Nothing in this package is reached any
// other way today, but the neighbouring action already has an in-process
// caller — handler.User.Add sets a user's plan marks inside its own
// transaction, calling PlanPeriodEnd directly — so "the HTTP layer validated
// it" is an assumption this package should not build on.
func validateCreatePlan(r *req.CreatePlanReq) (planDraft, error) {
	name := strings.TrimSpace(r.PlanName)
	if name == "" {
		return planDraft{}, apperr.Invalidf("套餐名称不能为空")
	}
	if utf8.RuneCountInString(name) > planNameLimit {
		return planDraft{}, apperr.Invalidf("套餐名称不能超过 %d 个字符", planNameLimit)
	}
	if r.TotalTraffic <= 0 {
		return planDraft{}, apperr.Invalidf("流量额度必须大于 0")
	}
	// The column is a plain int with no check constraint, so an out-of-range
	// period stores cleanly and only misbehaves later: PlanPeriodEnd leaves the
	// expiry at the moment of creation, and the reset scheduler skips the user
	// entirely — no reset and no quota enforcement, silently.
	if r.Period < int32(entity.Month) || r.Period > int32(entity.Year) {
		return planDraft{}, apperr.Invalidf("重置周期 %d 不是合法的周期", r.Period)
	}
	return planDraft{name: name, traffic: r.TotalTraffic, period: r.Period}, nil
}

// CreatePlan adds one plan to the catalogue and, when the request names a
// user, associates it with them in the same transaction.
//
// Administrators only, like the rest of this file: a plan is a shared
// catalogue entry, and the association half hands out quota and a fresh
// expiry.
//
// The association is part of this action rather than a second request from the
// console because the two-step version leaves a plan nobody uses behind
// whenever the second step fails — in a catalogue every administrator picks
// from, and which has no delete. handler.User.Add records what that shape
// already cost once: it associated a plan after committing the new account, so
// a failure there reported an error over an account that already existed.
func CreatePlan(ctx context.Context, r *req.CreatePlanReq) (*resp.CreatePlanResp, error) {
	if err := requireSuperAdmin(ctx); err != nil {
		return nil, err
	}
	draft, err := validateCreatePlan(r)
	if err != nil {
		return nil, err
	}

	plan := &entity.TrafficPlan{
		TotalTraffic: draft.traffic,
		Period:       &draft.period,
		PlanName:     &draft.name,
	}
	err = dal.Q.Transaction(func(tx *dal.Query) error {
		// Enforced here because the table cannot enforce it: the unique key
		// that belongs on this column would fail to apply on any database that
		// has already accumulated duplicates. Two plans with one name are
		// indistinguishable in the dropdown they exist to populate.
		//
		// Locking, because a plain count-then-insert lets two administrators
		// creating the same name at the same time both read zero and both
		// insert — producing the duplicate this check exists to prevent, in a
		// catalogue with no delete. plan_name carries no index, so this locks
		// the scanned rows; the catalogue is a handful of rows and only ever
		// written by hand. handler.User.Add serialises concurrent creates the
		// same way, for the same reason.
		taken, err := tx.TrafficPlan.WithContext(ctx).
			Clauses(clause.Locking{Strength: "UPDATE"}).
			Where(tx.TrafficPlan.PlanName.Eq(draft.name)).
			Count()
		if err != nil {
			return err
		}
		if taken > 0 {
			return apperr.Conflictf("套餐「%s」已存在", draft.name)
		}
		if err := tx.TrafficPlan.WithContext(ctx).Create(plan); err != nil {
			return err
		}
		if r.UserId == nil {
			return nil
		}

		// Checked rather than inferred from the update's RowsAffected: an
		// update that changes nothing also affects no rows, so that number
		// cannot tell "no such user" from "already had these values".
		found, err := tx.User.WithContext(ctx).Where(tx.User.ID.Eq(*r.UserId)).Count()
		if err != nil {
			return err
		}
		if found == 0 {
			return apperr.NotFoundf("用户 %d 不存在", *r.UserId)
		}
		// Same marks and the same arithmetic as AssociatePlan: associating is
		// an overwrite, so both run from now rather than from what the user
		// had left.
		from := PlanPeriodEnd(time.Now(), &draft.period)
		if _, err := tx.User.WithContext(ctx).Where(tx.User.ID.Eq(*r.UserId)).Updates(
			&entity.User{
				PlanID:           plan.ID,
				ExpirationTime:   &from,
				ResetTrafficTime: &from,
			},
		); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// The new plan's id goes back so the console can select it: the 关联套餐
	// dialog's inline create has to leave the caller on the plan they just
	// made, not on an unchanged dropdown.
	return &resp.CreatePlanResp{Plan: &resp.PlanTo{TrafficPlan: plan}}, nil
}

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
