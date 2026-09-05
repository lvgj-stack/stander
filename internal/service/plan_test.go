package service

import (
	"testing"
	"time"

	"github.com/lvgj-stack/stander/internal/model/entity"
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
