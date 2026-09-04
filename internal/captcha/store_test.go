package captcha

import (
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func newStore(t *testing.T) (*Store, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Discard})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&Entry{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return New(db), db
}

func TestSetThenVerify(t *testing.T) {
	s, _ := newStore(t)

	if err := s.Set("id-1", "ab12"); err != nil {
		t.Fatalf("Set: %v", err)
	}
	if !s.Verify("id-1", "ab12", true) {
		t.Error("the answer that was stored must verify")
	}
}

// A captcha is single use. Verifying twice must fail the second time, or a
// captured login form could be replayed.
func TestVerifyConsumesTheCaptcha(t *testing.T) {
	s, _ := newStore(t)
	if err := s.Set("id-1", "ab12"); err != nil {
		t.Fatalf("Set: %v", err)
	}

	if !s.Verify("id-1", "ab12", true) {
		t.Fatal("first verify should succeed")
	}
	if s.Verify("id-1", "ab12", true) {
		t.Error("second verify must fail: the captcha was consumed")
	}
}

// A wrong guess also consumes it, so an attacker cannot brute force one image.
func TestWrongAnswerConsumesTheCaptcha(t *testing.T) {
	s, _ := newStore(t)
	if err := s.Set("id-1", "ab12"); err != nil {
		t.Fatalf("Set: %v", err)
	}

	if s.Verify("id-1", "wrong", true) {
		t.Fatal("a wrong answer must not verify")
	}
	if s.Verify("id-1", "ab12", true) {
		t.Error("the correct answer must not work after a failed attempt")
	}
}

func TestUnknownIDDoesNotVerify(t *testing.T) {
	s, _ := newStore(t)
	if s.Verify("never-issued", "ab12", true) {
		t.Error("an unknown id must not verify")
	}
}

// An empty stored answer must never match an empty submitted answer, which is
// what a naive equality check would do for a missing row.
func TestEmptyAnswerDoesNotVerify(t *testing.T) {
	s, _ := newStore(t)
	if s.Verify("never-issued", "", true) {
		t.Error("an empty answer against a missing captcha must not verify")
	}
}

func TestExpiredCaptchaDoesNotVerify(t *testing.T) {
	s, db := newStore(t)
	if err := db.Create(&Entry{
		ID:        "old",
		Answer:    "ab12",
		ExpiresAt: time.Now().Add(-time.Minute),
	}).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}

	if s.Verify("old", "ab12", true) {
		t.Error("an expired captcha must not verify")
	}
}

// The sweep is what keeps the table from growing by one row per issued captcha.
func TestDeleteExpiredRemovesOnlyStaleRows(t *testing.T) {
	s, db := newStore(t)
	if err := s.Set("fresh", "ab12"); err != nil {
		t.Fatalf("Set: %v", err)
	}
	if err := db.Create(&Entry{
		ID: "stale", Answer: "cd34", ExpiresAt: time.Now().Add(-time.Hour),
	}).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}

	n, err := DeleteExpired(db)
	if err != nil {
		t.Fatalf("DeleteExpired: %v", err)
	}
	if n != 1 {
		t.Errorf("deleted %d rows, want 1", n)
	}
	if !s.Verify("fresh", "ab12", true) {
		t.Error("the unexpired captcha must survive the sweep")
	}
}

// Re-issuing under the same id must overwrite rather than fail on the primary
// key, which is what the upsert clause is for.
func TestSetIsIdempotent(t *testing.T) {
	s, _ := newStore(t)
	if err := s.Set("id-1", "old1"); err != nil {
		t.Fatalf("first Set: %v", err)
	}
	if err := s.Set("id-1", "new1"); err != nil {
		t.Fatalf("second Set: %v", err)
	}
	if s.Verify("id-1", "old1", false) {
		t.Error("the replaced answer must no longer verify")
	}
	if !s.Verify("id-1", "new1", true) {
		t.Error("the new answer must verify")
	}
}
