// Package captcha stores captcha answers in the database so that any API
// replica can verify a captcha issued by any other.
//
// base64Captcha's default store keeps answers in a process-local map. With one
// replica that is fine; with N replicas roughly (N-1)/N of logins fail, because
// /auth/captcha and /auth/login usually land on different pods. The session
// cookie cannot carry the answer instead — the cookie store is signed, not
// encrypted, so the client could simply read it.
package captcha

import (
	"time"

	"github.com/cloudwego/hertz/pkg/common/hlog"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// TTL is how long an unused captcha stays valid.
const TTL = 5 * time.Minute

// Entry is a pending captcha answer.
//
// The column types are deliberately not pinned in the tags: production DDL
// comes from sql/init.sql, and a MySQL-specific `type:datetime(3)` makes the
// struct unusable against any other dialect — including the in-memory SQLite
// the tests run on.
type Entry struct {
	ID        string    `gorm:"column:id;primaryKey"`
	Answer    string    `gorm:"column:answer;not null"`
	ExpiresAt time.Time `gorm:"column:expires_at;not null;index"`
}

func (Entry) TableName() string { return "captcha" }

// Store implements base64Captcha.Store on top of gorm.
type Store struct {
	db  *gorm.DB
	ttl time.Duration
}

func New(db *gorm.DB) *Store {
	return &Store{db: db, ttl: TTL}
}

// Set records the answer for id.
func (s *Store) Set(id string, value string) error {
	return s.db.Clauses(clause.OnConflict{UpdateAll: true}).Create(&Entry{
		ID:        id,
		Answer:    value,
		ExpiresAt: time.Now().Add(s.ttl),
	}).Error
}

// Get returns the answer for id, or "" when it is unknown or expired.
func (s *Store) Get(id string, clear bool) string {
	var e Entry
	if err := s.db.Where("id = ?", id).First(&e).Error; err != nil {
		return ""
	}
	if clear {
		s.delete(id)
	}
	if time.Now().After(e.ExpiresAt) {
		return ""
	}
	return e.Answer
}

// Verify reports whether answer matches, consuming the captcha either way so a
// wrong guess cannot be retried against the same image.
func (s *Store) Verify(id, answer string, clear bool) bool {
	stored := s.Get(id, clear)
	return stored != "" && stored == answer
}

func (s *Store) delete(id string) {
	if err := s.db.Where("id = ?", id).Delete(&Entry{}).Error; err != nil {
		hlog.Warnf("deleting captcha %s: %v", id, err)
	}
}

// DeleteExpired removes captchas nobody came back for. Called by the worker;
// without it the table grows by one row per issued captcha forever.
func DeleteExpired(db *gorm.DB) (int64, error) {
	res := db.Where("expires_at < ?", time.Now()).Delete(&Entry{})
	return res.RowsAffected, res.Error
}
