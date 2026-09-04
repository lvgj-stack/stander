package worker

import (
	"context"
	"errors"
	"time"

	"github.com/cloudwego/hertz/pkg/common/hlog"

	"github.com/lvgj-stack/stander/internal/model/dal"
	"github.com/lvgj-stack/stander/internal/model/entity"
	"github.com/lvgj-stack/stander/internal/service"
)

// ReconcileTrafficPlans makes one pass over every user: it totals the traffic
// used in the current billing period and rolls the period forward when the
// cycle has ended or the quota is blown.
//
// The previous implementation pushed users onto a buffered channel consumed by
// a goroutine that had no cancellation path, so it leaked on shutdown. The work
// is done inline here; there was never a reason to hand it to another
// goroutine in the same process.
func ReconcileTrafficPlans(ctx context.Context) error {
	users, err := dal.User.WithContext(ctx).Preload(dal.User.TrafficPlan).Find()
	if err != nil {
		return err
	}

	for _, user := range users {
		if err := ctx.Err(); err != nil {
			return err
		}
		if user.ID == nil || user.ResetTrafficTime == nil || user.TrafficPlan.Period == nil {
			continue
		}

		used, err := service.PeriodTrafficUsage(ctx, user)
		if err != nil {
			hlog.Errorf("period usage for user %d failed: %v", *user.ID, err)
			continue
		}

		if time.Now().After(*user.ResetTrafficTime) || used > user.TrafficPlan.TotalTraffic {
			if err := rollTrafficPeriod(ctx, user); err != nil {
				hlog.Errorf("rolling traffic period for user %d failed: %v", *user.ID, err)
			}
		}
	}
	return nil
}

// errNoExpiry marks a user whose plan has no expiry date, which cannot be
// compared against the next reset.
var errNoExpiry = errors.New("user has no expiration time")

// rollTrafficPeriod moves the user's traffic reset mark to the end of the next
// plan period, unless their subscription runs out before then.
func rollTrafficPeriod(ctx context.Context, user *entity.User) error {
	next := nextResetTime(time.Now(), entity.PlanPeriod(*user.TrafficPlan.Period))

	// The original dereferenced ExpirationTime unconditionally and panicked on
	// any user whose expiry was NULL.
	if user.ExpirationTime == nil {
		return errNoExpiry
	}

	// The 5h slack absorbs the gap between a subscription expiring and the
	// nightly reset it was paid up to.
	if !user.ExpirationTime.Add(5 * time.Hour).After(next) {
		hlog.Warnf("user expired, not rolling traffic period: %d", *user.ID)
		return nil
	}

	_, err := dal.User.WithContext(ctx).
		Where(dal.User.ID.Eq(*user.ID)).
		Update(dal.User.ResetTrafficTime, next)
	return err
}

// nextResetTime advances from by one plan period.
func nextResetTime(from time.Time, period entity.PlanPeriod) time.Time {
	switch period {
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
