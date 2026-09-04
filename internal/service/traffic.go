package service

import (
	"context"
	"time"

	"github.com/lvgj-stack/stander/internal/model/dal"
	"github.com/lvgj-stack/stander/internal/model/entity"
)

// PeriodTrafficUsage returns how many bytes the user has consumed in the
// billing period that ends at their next traffic reset.
//
// This used to be served from a process-local sync.Map that only the background
// job wrote to, which meant the API reported 0 for every user unless the job
// happened to run in the same process. The number is derivable from
// user_daily_traffic, so it is derived — the API is stateless and every replica
// gives the same answer.
func PeriodTrafficUsage(ctx context.Context, user *entity.User) (int64, error) {
	from, to, ok := billingPeriod(user)
	if !ok {
		return 0, nil
	}

	rows, err := dal.UserDailyTraffic.WithContext(ctx).
		Select(dal.UserDailyTraffic.TotalTraffic).
		Where(
			dal.UserDailyTraffic.UserID.Eq(*user.ID),
			dal.UserDailyTraffic.Date.Gte(from),
			dal.UserDailyTraffic.Date.Lte(to),
		).Find()
	if err != nil {
		return 0, err
	}

	var total int64
	for _, row := range rows {
		total += row.TotalTraffic
	}
	return total, nil
}

// billingPeriod is the window [from, to] covered by the user's current plan
// cycle. It reports false when the user has no plan period or no reset mark,
// in which case there is no period to total up.
func billingPeriod(user *entity.User) (from, to time.Time, ok bool) {
	if user == nil || user.ResetTrafficTime == nil || user.TrafficPlan.Period == nil {
		return time.Time{}, time.Time{}, false
	}
	to = *user.ResetTrafficTime
	from = to

	// The extra day back matches the original accounting: daily rows are dated,
	// so the period start is inclusive of the day the previous cycle ended.
	switch entity.PlanPeriod(*user.TrafficPlan.Period) {
	case entity.Month:
		from = from.AddDate(0, -1, -1)
	case entity.Quarter:
		from = from.AddDate(0, -3, -1)
	case entity.HalfYear:
		from = from.AddDate(0, -6, -1)
	case entity.Year:
		from = from.AddDate(-1, 0, -1)
	}
	return from, to, true
}

// bytesToGB is the unit the API reports traffic in.
func bytesToGB(b int64) int64 { return b / 1024 / 1024 / 1024 }
