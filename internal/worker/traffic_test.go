package worker

import (
	"testing"
	"time"

	"github.com/lvgj-stack/stander/internal/model/entity"
)

func TestNextResetTime(t *testing.T) {
	from := time.Date(2026, 1, 31, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name   string
		period entity.PlanPeriod
		want   time.Time
	}{
		{"month", entity.Month, from.AddDate(0, 1, 0)},
		{"quarter", entity.Quarter, from.AddDate(0, 3, 0)},
		{"half year", entity.HalfYear, from.AddDate(0, 6, 0)},
		{"year", entity.Year, from.AddDate(1, 0, 0)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := nextResetTime(from, tt.period); !got.Equal(tt.want) {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}
}

// An unrecognised period must leave the mark alone rather than silently reset
// the user's traffic on every pass.
func TestNextResetTimeUnknownPeriodDoesNotAdvance(t *testing.T) {
	from := time.Date(2026, 1, 31, 12, 0, 0, 0, time.UTC)
	if got := nextResetTime(from, entity.PlanPeriod(99)); !got.Equal(from) {
		t.Errorf("got %v, want the time unchanged", got)
	}
}
