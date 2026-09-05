package service

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gen"

	"github.com/lvgj-stack/stander/internal/model/dal"
	"github.com/lvgj-stack/stander/internal/service/req"
	"github.com/lvgj-stack/stander/internal/service/resp"
)

// GetUserPlanInfo reports the plan, quota and recent daily consumption of one
// user.
//
// A caller who is not the super admin may only ask about themselves. The user
// id used to be taken from the request verbatim, so any signed-in account
// could read anyone else's plan and traffic history by changing one number —
// harmless while the only caller was the admin console, not harmless now that
// the user portal calls it too.
func GetUserPlanInfo(ctx context.Context, r *req.GetUserPlanInfoReq) (*resp.GetUserPlanInfoResp, error) {
	r.UserId = scopeToCaller(ctx, r.UserId)

	user, err := dal.User.WithContext(ctx).Where(dal.User.ID.Eq(r.UserId)).Preload(dal.User.TrafficPlan).First()
	if err != nil {
		return nil, err
	}
	dfs, err := dal.UserDailyTraffic.WithContext(ctx).Where(dal.UserDailyTraffic.UserID.Eq(*user.ID)).
		Order(dal.UserDailyTraffic.Date.Desc()).Limit(30).Find()
	if err != nil {
		return nil, err
	}

	for i, j := 0, len(dfs)-1; i < j; i, j = i+1, j-1 {
		dfs[i], dfs[j] = dfs[j], dfs[i]
	}
	expireTime := time.Now()
	resetTrafficTime := time.Now()
	plan := "测试套餐"
	if user.ExpirationTime != nil {
		expireTime = *user.ExpirationTime
	}
	if user.ResetTrafficTime != nil {
		resetTrafficTime = *user.ResetTrafficTime
	}
	if user.TrafficPlan.PlanName != nil {
		plan = *user.TrafficPlan.PlanName
	}
	usedTraffic, err := PeriodTrafficUsage(ctx, user)
	if err != nil {
		return nil, err
	}

	var dailyTraffics []resp.DailyTraffic
	for _, df := range dfs {
		dailyTraffics = append(dailyTraffics, resp.DailyTraffic{
			Date:    df.Date,
			Traffic: df.TotalTraffic,
		})

	}
	return &resp.GetUserPlanInfoResp{
		Username:         *user.Username,
		ExpirationTime:   expireTime,
		ResetTrafficTime: resetTrafficTime,
		PlanTraffic:      user.TrafficPlan.TotalTraffic,
		UsedTraffic:      usedTraffic,
		PlanName:         plan,
		DailyTraffics:    dailyTraffics,
	}, nil
}

// ListUsers reports every account with its plan and consumption.
//
// Administrators only. There is no per-caller narrowing that would make sense
// here: the whole point of the action is the cross-account view, and it
// returns exactly the plan, expiry and byte-level consumption that
// GetUserPlanInfo scopes to the caller — in bulk. A user who needs their own
// figures calls GetUserPlanInfo.
func ListUsers(ctx context.Context, r *req.ListUsersReq) (*resp.ListUsersResp, error) {
	if err := requireSuperAdmin(ctx); err != nil {
		return nil, err
	}

	var q []gen.Condition

	if r.Username != "" {
		q = append(q, dal.User.Username.Like(fmt.Sprintf("%%%s%%", r.Username)))
	}

	od := dal.User.ExpirationTime.Asc()

	if r.OrderBy != "" {
		name, ok := dal.User.GetFieldByName(r.OrderBy)
		if ok {
			od = name.Desc()
			if r.Asc {
				od = name.Asc()
			}
		}
	}

	users, count, err := dal.User.WithContext(ctx).
		Where(q...).
		Order(od).
		Preload(dal.User.TrafficPlan).
		FindByPage(r.PageSize*(r.PageNo-1), r.PageSize)
	if err != nil {
		return nil, err
	}
	var userTos []*resp.UserTo
	for _, user := range users {
		// Bytes, matching TrafficPlan.TotalTraffic, which the caller shows
		// this against. It used to be divided down to whole gigabytes here
		// while the quota beside it stayed in bytes.
		used, err := PeriodTrafficUsage(ctx, user)
		if err != nil {
			return nil, err
		}
		userTos = append(userTos, &resp.UserTo{
			User:        user,
			UsedTraffic: used,
		})
	}
	return &resp.ListUsersResp{
		PageSize:   r.PageSize,
		PageNumber: r.PageNo,
		TotalCount: count,
		Users:      userTos,
	}, nil
}

// EditUser writes a user's subscription expiry. Administrators only — it takes
// the target id from the request, so without this check any account could
// extend its own subscription or expire somebody else's.
func EditUser(ctx context.Context, r *req.EditUserReq) (*resp.EmptyResp, error) {
	if err := requireSuperAdmin(ctx); err != nil {
		return nil, err
	}

	updatedFields := make(map[string]any)
	if r.ExpirationTime != nil {
		updatedFields["expiration_time"] = r.ExpirationTime
	}
	_, err := dal.User.WithContext(ctx).Where(dal.User.ID.Eq(r.ID)).Updates(updatedFields)
	if err != nil {
		return nil, err
	}

	return &resp.EmptyResp{}, nil

}
