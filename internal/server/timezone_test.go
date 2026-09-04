package server

import (
	"testing"
	"time"
)

func TestApplyTimezone(t *testing.T) {
	original := time.Local
	t.Cleanup(func() { time.Local = original })

	if err := applyTimezone("Asia/Shanghai"); err != nil {
		t.Fatalf("applyTimezone: %v", err)
	}
	if got := time.Local.String(); got != "Asia/Shanghai" {
		t.Errorf("time.Local = %q, want Asia/Shanghai", got)
	}

	// The zone data is embedded via time/tzdata in main.go, so this must work
	// in a distroless image with no zoneinfo on disk.
	_, offset := time.Now().Zone()
	if offset != 8*3600 {
		t.Errorf("offset = %ds, want 28800s (UTC+8)", offset)
	}
}

func TestApplyTimezoneEmptyIsNoop(t *testing.T) {
	original := time.Local
	t.Cleanup(func() { time.Local = original })

	if err := applyTimezone(""); err != nil {
		t.Fatalf("applyTimezone(\"\"): %v", err)
	}
	if time.Local != original {
		t.Error("an empty timezone must leave time.Local alone")
	}
}

func TestApplyTimezoneRejectsUnknownZone(t *testing.T) {
	if err := applyTimezone("Mars/Olympus_Mons"); err == nil {
		t.Fatal("expected an error for an unknown zone")
	}
}
