package inout

import (
	"time"

	"github.com/lvgj-stack/stander/internal/admin/model"
	"github.com/lvgj-stack/stander/internal/model/entity"
)

type LoginRes struct {
	AccessToken string `json:"accessToken"`
}

// UserDetailRes used to embed a second, hand-written model of the `user` table.
// That struct is gone; the fields are spelled out here so the wire format is
// pinned by this DTO rather than by whichever model happens to be embedded.
// TestUserDetailResJSONShape guards it.
type UserDetailRes struct {
	ID         int       `json:"id"`
	Username   string    `json:"username"`
	Password   string    `json:"password"`
	Enable     bool      `json:"enable"`
	CreateTime time.Time `json:"createTime"`
	UpdateTime time.Time `json:"updateTime"`

	Profile *model.Profile `json:"profile" gorm:"-"`
	// Role is one of identity.RoleSuperAdmin / identity.RoleUser. It used to be
	// a `roles` array plus a `currentRole` object, which only ever differed
	// while an account could hold several roles and switch between them.
	Role string `json:"role" gorm:"-"`
}

// NewUserDetailRes maps the gorm-gen entity onto the response shape the admin
// console has always seen. Every entity column is a pointer, so each read has
// to tolerate NULL.
func NewUserDetailRes(u *entity.User) *UserDetailRes {
	r := &UserDetailRes{}
	if u == nil {
		return r
	}
	if u.ID != nil {
		r.ID = int(*u.ID)
	}
	if u.Username != nil {
		r.Username = *u.Username
	}
	if u.Password != nil {
		r.Password = *u.Password
	}
	if u.Enable != nil {
		r.Enable = *u.Enable != 0
	}
	if u.CreateTime != nil {
		r.CreateTime = *u.CreateTime
	}
	if u.UpdateTime != nil {
		r.UpdateTime = *u.UpdateTime
	}
	return r
}

type UserListItem struct {
	ID         int       `json:"id"`
	Username   string    `json:"username"`
	Enable     bool      `json:"enable"`
	CreateTime time.Time `json:"createTime"`
	UpdateTime time.Time `json:"updateTime"`
	Gender     int       `json:"gender"`
	Avatar     string    `json:"avatar"`
	Address    string    `json:"address"`
	Email      string    `json:"email"`
	Role       string    `json:"role"`
}
type UserListRes struct {
	PageData []UserListItem `json:"pageData"`
	Total    int64          `json:"total"`
}
