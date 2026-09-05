package service

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gen"

	"github.com/lvgj-stack/stander/internal/apperr"
	"github.com/lvgj-stack/stander/internal/model/dal"
	"github.com/lvgj-stack/stander/internal/model/entity"
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

// GetUserResources lists the nodes and chains one user is allowed to build
// rules on.
//
// These are the `user_role_node_mappings` / `user_role_chain_mappings` rows
// keyed by user id. Rows keyed by role code are deliberately left out: they
// are what AddNode used to write for a node an administrator created and
// nothing writes any more, they are not held by any particular account, and
// showing them here would invite an administrator to "revoke" a row this
// action cannot address.
func GetUserResources(ctx context.Context, r *req.GetUserResourcesReq) (*resp.GetUserResourcesResp, error) {
	if err := requireSuperAdmin(ctx); err != nil {
		return nil, err
	}

	res := &resp.GetUserResourcesResp{NodeIds: []int64{}, ChainIds: []int64{}}
	if err := dal.UserRoleNodeMapping.WithContext(ctx).
		Select(dal.UserRoleNodeMapping.NodeID).
		Where(dal.UserRoleNodeMapping.UserID.Eq(r.UserId)).
		Scan(&res.NodeIds); err != nil {
		return nil, err
	}
	if err := dal.UserRoleChainMapping.WithContext(ctx).
		Select(dal.UserRoleChainMapping.ChainID).
		Where(dal.UserRoleChainMapping.UserID.Eq(r.UserId)).
		Scan(&res.ChainIds); err != nil {
		return nil, err
	}
	return res, nil
}

// SetUserResources replaces which nodes and chains a user may build rules on.
//
// This is what makes the user portal usable at all. Every read and write on
// that side is scoped to these rows — ListNode and ListChain filter on them,
// checkUserNodePermission and checkUserChainPermission gate AddRule on them —
// and the only other thing that ever created one was AddNode run by the user
// themselves, which it no longer does: creating a node is an administrator's
// action and it grants nobody anything. Without this action a forwarding
// account sees an empty node list forever and can create nothing.
//
// It is emphatically not the permission tree that was removed: that decided
// which menu entries a role saw, in a table the router never consulted. This
// decides which rows of real infrastructure one account may touch, and the
// service layer has always enforced it.
func SetUserResources(ctx context.Context, r *req.SetUserResourcesReq) (*resp.EmptyResp, error) {
	if err := requireSuperAdmin(ctx); err != nil {
		return nil, err
	}

	// Reject unknown ids rather than storing a grant to a node that does not
	// exist: the row would sit there looking like access to whatever id is
	// reused next.
	if err := allExist(ctx, r.NodeIds, r.ChainIds); err != nil {
		return nil, err
	}

	err := dal.Q.Transaction(func(tx *dal.Query) error {
		// Only this user's own rows. The role-code rows left behind by the
		// AddNode of the day belong to the role, not to anyone here.
		if _, err := tx.UserRoleNodeMapping.WithContext(ctx).
			Where(tx.UserRoleNodeMapping.UserID.Eq(r.UserId)).
			Delete(&entity.UserRoleNodeMapping{}); err != nil {
			return err
		}
		if _, err := tx.UserRoleChainMapping.WithContext(ctx).
			Where(tx.UserRoleChainMapping.UserID.Eq(r.UserId)).
			Delete(&entity.UserRoleChainMapping{}); err != nil {
			return err
		}
		for _, id := range r.NodeIds {
			if err := tx.UserRoleNodeMapping.WithContext(ctx).Create(&entity.UserRoleNodeMapping{
				UserID: &r.UserId,
				NodeID: int32(id),
			}); err != nil {
				return err
			}
		}
		for _, id := range r.ChainIds {
			if err := tx.UserRoleChainMapping.WithContext(ctx).Create(&entity.UserRoleChainMapping{
				UserID:  &r.UserId,
				ChainID: int32(id),
			}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &resp.EmptyResp{}, nil
}

// allExist reports an error naming the first id that has no row behind it.
func allExist(ctx context.Context, nodeIds, chainIds []int64) error {
	for _, id := range nodeIds {
		if _, err := dal.Node.WithContext(ctx).Where(dal.Node.ID.Eq(id)).First(); err != nil {
			return apperr.NotFoundf("节点 %d 不存在: %w", id, err)
		}
	}
	for _, id := range chainIds {
		if _, err := dal.Chain.WithContext(ctx).Where(dal.Chain.ID.Eq(id)).First(); err != nil {
			return apperr.NotFoundf("链路 %d 不存在: %w", id, err)
		}
	}
	return nil
}
