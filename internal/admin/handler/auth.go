package handler

import (
	"context"
	"crypto/md5"
	"fmt"
	"slices"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/lvgj-stack/stander/internal/admin/inout"
	"github.com/lvgj-stack/stander/internal/admin/model"
	"github.com/lvgj-stack/stander/internal/apperr"
	"github.com/lvgj-stack/stander/internal/db"
	"github.com/lvgj-stack/stander/internal/identity"
	"github.com/lvgj-stack/stander/internal/model/entity"
	"github.com/lvgj-stack/stander/internal/utils"
)

var Auth = &auth{}

type auth struct{}

func (auth) Login(c context.Context, ctx *app.RequestContext) {
	var params inout.LoginReq
	if err := ctx.BindAndValidate(&params); err != nil {
		Resp.Fail(c, ctx, err)
		return
	}

	var info entity.User
	db.Dao.Model(entity.User{}).
		Where("username =? ", params.Username).
		Where("password=?", fmt.Sprintf("%x", md5.Sum([]byte(params.Password)))).
		Find(&info)
	if info.ID == nil || *info.ID == 0 {
		Resp.Fail(c, ctx, apperr.Unauthorizedf("账号或密码不正确"))
		return
	}
	userID := int(*info.ID)

	Resp.Succ(ctx, inout.LoginRes{
		AccessToken: utils.GenerateToken(userID, userID, deref(info.Username), roleOf(userID)),
	})
}

// roleOf reads the account's role.
//
// The join table can hold more than one row per account — it is old enough to
// predate the two-role rule — so an account that still carries SUPER_ADMIN
// alongside anything else is an administrator. Everything else, including an
// account with no role row at all, is a plain user: that is exactly what
// IsSuperAdmin decides downstream, so resolving it here keeps the token
// honest about what the caller will actually be allowed to do.
func roleOf(userID int) string {
	var codes []string
	db.Dao.Model(model.Role{}).
		Where("id IN (?)", db.Dao.Model(model.UserRolesRole{}).
			Where("userId = ?", userID).Select("roleId")).
		Select("code").Find(&codes)

	if slices.Contains(codes, identity.RoleSuperAdmin) {
		return identity.RoleSuperAdmin
	}
	return identity.RoleUser
}

func (auth) Password(c context.Context, ctx *app.RequestContext) {
	var params inout.AuthPwReq
	if err := ctx.BindAndValidate(&params); err != nil {
		Resp.Fail(c, ctx, err)
		return
	}
	uid, _ := ctx.Get("uid")

	var matched int64
	db.Dao.Model(entity.User{}).
		Where("id=? and password=?", uid, fmt.Sprintf("%x", md5.Sum([]byte(params.OldPassword)))).
		Count(&matched)
	if matched == 0 {
		Resp.Fail(c, ctx, apperr.Invalidf("旧密码不正确"))
		return
	}
	if err := db.Dao.Model(entity.User{}).
		Where("id=? ", uid).
		Update("password", fmt.Sprintf("%x", md5.Sum([]byte(params.NewPassword)))).Error; err != nil {
		Resp.Fail(c, ctx, err)
		return
	}
	Resp.Succ(ctx, true)
}

func (auth) Logout(c context.Context, ctx *app.RequestContext) {
	Resp.Succ(ctx, true)
}
