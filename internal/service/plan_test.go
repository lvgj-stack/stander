package service

import (
	"strings"
	"testing"
	"time"

	"github.com/lvgj-stack/stander/internal/apperr"
	"github.com/lvgj-stack/stander/internal/model/entity"
	"github.com/lvgj-stack/stander/internal/service/req"
)

// Account creation sets these marks inside its own transaction rather than
// calling AssociatePlan after committing, so both paths have to agree on when
// a plan runs out.
func TestPlanPeriodEnd(t *testing.T) {
	// A mid-month date, so the arithmetic is unambiguous.
	from := time.Date(2026, 3, 15, 12, 0, 0, 0, time.UTC)
	period := func(p entity.PlanPeriod) *int32 { v := int32(p); return &v }

	tests := []struct {
		name   string
		period *int32
		want   time.Time
	}{
		{"month", period(entity.Month), time.Date(2026, 4, 15, 12, 0, 0, 0, time.UTC)},
		{"quarter", period(entity.Quarter), time.Date(2026, 6, 15, 12, 0, 0, 0, time.UTC)},
		{"half year", period(entity.HalfYear), time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC)},
		{"year", period(entity.Year), time.Date(2027, 3, 15, 12, 0, 0, 0, time.UTC)},
		// The column is nullable. The previous inline version dereferenced it,
		// so a plan row with no period panicked the request.
		{"null period is left alone rather than panicking", nil, from},
		{"an unknown period is left alone", period(entity.PlanPeriod(99)), from},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := PlanPeriodEnd(from, tt.period); !got.Equal(tt.want) {
				t.Fatalf("PlanPeriodEnd() = %s, want %s", got, tt.want)
			}
		})
	}
}

// time.AddDate normalises an overflowing day rather than clamping to the end
// of the month, so a monthly plan taken out on the 31st of a short month
// lands in the month after next. Pinned here because it is surprising, not
// because it is desirable — changing it would move real expiry dates.
func TestPlanPeriodEndNormalisesShortMonths(t *testing.T) {
	month := int32(entity.Month)
	jan31 := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)

	got := PlanPeriodEnd(jan31, &month)
	want := time.Date(2026, 3, 3, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("PlanPeriodEnd(Jan 31, month) = %s, want %s", got.Format("2006-01-02"), want.Format("2006-01-02"))
	}
}

// The rules a create request has to pass before anything is written.
//
// They live in a plain function rather than in `vd:` tags so that they are
// testable at all: a tag rule only runs when hertz binds a request, and
// pinning it would mean standing up a request instead of calling a function.
func TestValidateCreatePlan(t *testing.T) {
	valid := func(mutate func(*req.CreatePlanReq)) *req.CreatePlanReq {
		r := &req.CreatePlanReq{PlanName: "月付 100G", TotalTraffic: 100 << 30, Period: int32(entity.Month)}
		if mutate != nil {
			mutate(r)
		}
		return r
	}

	t.Run("accepts a well-formed request", func(t *testing.T) {
		got, err := validateCreatePlan(valid(nil))
		if err != nil {
			t.Fatalf("validateCreatePlan() error = %v, want nil", err)
		}
		if got.name != "月付 100G" || got.traffic != 100<<30 || got.period != int32(entity.Month) {
			t.Fatalf("validateCreatePlan() = %+v, want the request's own values", got)
		}
	})

	// Otherwise 「月付」 and 「月付 」 are two different rows in a catalogue whose
	// whole job is to be picked from a dropdown by name.
	t.Run("trims the name", func(t *testing.T) {
		got, err := validateCreatePlan(valid(func(r *req.CreatePlanReq) { r.PlanName = "  月付 100G\t" }))
		if err != nil {
			t.Fatalf("validateCreatePlan() error = %v, want nil", err)
		}
		if got.name != "月付 100G" {
			t.Fatalf("name = %q, want %q", got.name, "月付 100G")
		}
	})

	// Every period the enum defines has to be accepted, Month included — Month
	// is 0, the value most likely to be dropped on the way here.
	for name, period := range map[string]entity.PlanPeriod{
		"month":     entity.Month,
		"quarter":   entity.Quarter,
		"half year": entity.HalfYear,
		"year":      entity.Year,
	} {
		t.Run("accepts period "+name, func(t *testing.T) {
			got, err := validateCreatePlan(valid(func(r *req.CreatePlanReq) { r.Period = int32(period) }))
			if err != nil {
				t.Fatalf("validateCreatePlan() error = %v, want nil", err)
			}
			if got.period != int32(period) {
				t.Fatalf("period = %d, want %d", got.period, int32(period))
			}
		})
	}

	rejects := []struct {
		name string
		req  *req.CreatePlanReq
	}{
		{"an empty name", valid(func(r *req.CreatePlanReq) { r.PlanName = "" })},
		{"a name that is only whitespace", valid(func(r *req.CreatePlanReq) { r.PlanName = "   \t" })},
		// Longer than the varchar the column is. Rejected here so it comes back
		// as something the operator can fix, rather than as the driver error
		// apperr can only classify as Internal.
		{"a name longer than the column", valid(func(r *req.CreatePlanReq) {
			r.PlanName = strings.Repeat("套", planNameLimit+1)
		})},
		{"zero traffic", valid(func(r *req.CreatePlanReq) { r.TotalTraffic = 0 })},
		{"negative traffic", valid(func(r *req.CreatePlanReq) { r.TotalTraffic = -1 })},
		// The column is a plain int with no check constraint, so both of these
		// store cleanly and only misbehave later, in the reset scheduler.
		{"a period below the enum", valid(func(r *req.CreatePlanReq) { r.Period = -1 })},
		{"a period above the enum", valid(func(r *req.CreatePlanReq) { r.Period = int32(entity.Year) + 1 })},
	}
	for _, tt := range rejects {
		t.Run("rejects "+tt.name, func(t *testing.T) {
			_, err := validateCreatePlan(tt.req)
			if err == nil {
				t.Fatalf("validateCreatePlan() error = nil, want a rejection")
			}
			if got := apperr.KindOf(err); got != apperr.InvalidArgument {
				t.Fatalf("validateCreatePlan() kind = %v, want InvalidArgument", got)
			}
		})
	}
}
