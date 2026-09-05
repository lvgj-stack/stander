package handler

import (
	"context"
	"crypto/md5"
	"fmt"
	"strconv"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/lvgj-stack/stander/internal/admin/inout"
	"github.com/lvgj-stack/stander/internal/admin/model"
	"github.com/lvgj-stack/stander/internal/apperr"
	"github.com/lvgj-stack/stander/internal/db"
	"github.com/lvgj-stack/stander/internal/identity"
	"github.com/lvgj-stack/stander/internal/model/entity"
	"github.com/lvgj-stack/stander/internal/service"
	"github.com/lvgj-stack/stander/internal/utils"
)

var User = &user{}

type user struct{}

func (user) Detail(c context.Context, ctx *app.RequestContext) {
	uid, _ := ctx.Get("uid")
	jwtToken, _ := ctx.Get("jwt_token")
	claim, ok := jwtToken.(*utils.CustomClaims)
	if !ok {
		Resp.Fail(c, ctx, apperr.Unauthorizedf("无效的登录态"))
		return
	}

	var u entity.User
	db.Dao.Model(entity.User{}).Where("id=?", uid).Find(&u)
	data := inout.NewUserDetailRes(&u)

	db.Dao.Model(model.Profile{}).Where("userId=?", uid).Find(&data.Profile)
	// The token's role, not the stored one. The backend authorizes on exactly
	// this value — the middleware copies it into identity.Principal — so it is
	// what the console must route on. An account demoted while signed in keeps
	// an admin-looking token until it expires; routing it to the admin side
	// would hand it screens that every API call then answers as empty.
	data.Role = identity.NormalizeRole(claim.CurrentRoleCode)
	Resp.Succ(ctx, data)
}

func (user) List(c context.Context, ctx *app.RequestContext) {
	var data = inout.UserListRes{
		PageData: make([]inout.UserListItem, 0),
	}
	gender := ctx.DefaultQuery("gender", "")
	enable := ctx.DefaultQuery("enable", "")
	username := ctx.DefaultQuery("username", "")
	pageNo, _ := strconv.Atoi(ctx.DefaultQuery("pageNo", "1"))
	pageSize, _ := strconv.Atoi(ctx.DefaultQuery("pageSize", "10"))

	var profileList []model.Profile
	orm := db.Dao.Model(model.Profile{})
	if gender != "" {
		orm = orm.Where("gender=?", gender)
	}
	if enable != "" {
		orm = orm.Where("userId in(?)", db.Dao.Model(entity.User{}).Where("enable=?", enable).Select("id"))
	}
	if username != "" {
		orm = orm.Where("nickName like ?", "%"+username+"%")
	}

	orm.Count(&data.Total)
	orm.Offset((pageNo - 1) * pageSize).Limit(pageSize).Find(&profileList)
	for _, datum := range profileList {
		var uinfo entity.User
		db.Dao.Model(&entity.User{}).Where("ID = ?", datum.UserId).First(&uinfo)
		data.PageData = append(data.PageData, inout.UserListItem{
			ID:         int(deref(uinfo.ID)),
			Username:   deref(uinfo.Username),
			Enable:     deref(uinfo.Enable) != 0,
			CreateTime: deref(uinfo.CreateTime),
			UpdateTime: deref(uinfo.UpdateTime),
			Gender:     datum.Gender,
			Avatar:     datum.Avatar,
			Address:    datum.Address,
			Email:      datum.Email,
			Role:       roleOf(datum.UserId),
		})
	}
	Resp.Succ(ctx, data)
}

// Profile updates one profile row.
//
// Self-service: this is the 个人资料 screen on both sides of the console, so it
// cannot be gated on being an administrator. The row is addressed by profile
// id rather than user id, so ownership has to be looked up — otherwise any
// signed-in account could rewrite anyone's nickname, email and avatar by
// counting upwards.
func (user) Profile(c context.Context, ctx *app.RequestContext) {
	var params inout.PatchProfileUserReq
	if err := ctx.BindJSON(&params); err != nil {
		Resp.Fail(c, ctx, err)
		return
	}

	if !identity.FromContext(c).IsSuperAdmin() {
		uid, _ := ctx.Get("uid")
		var owner int64
		db.Dao.Model(model.Profile{}).Where("id=? and userId=?", params.Id, uid).Count(&owner)
		if owner == 0 {
			Resp.Fail(c, ctx, apperr.Forbiddenf("只能修改自己的资料"))
			return
		}
	}

	err := db.Dao.Model(model.Profile{}).Where("id=?", params.Id).Updates(model.Profile{
		Gender:   params.Gender,
		Address:  params.Address,
		Email:    params.Email,
		NickName: params.NickName,
		Avatar:   params.Avatar,
	}).Error
	if err != nil {
		Resp.Fail(c, ctx, err)
		return
	}
	Resp.Succ(ctx, nil)
}

func (user) Update(c context.Context, ctx *app.RequestContext) {
	var params inout.PatchUserReq
	if err := ctx.BindJSON(&params); err != nil {
		Resp.Fail(c, ctx, err)
		return
	}
	orm := db.Dao.Model(entity.User{}).Where("id=?", params.Id)
	if params.OldPassword != nil {
		orm = orm.Where("password=?", fmt.Sprintf("%x", md5.Sum([]byte(*params.OldPassword))))
	}
	if params.NewPassword != nil {
		orm.Update("password", fmt.Sprintf("%x", md5.Sum([]byte(*params.NewPassword))))
	}
	if params.Password != nil {
		orm.Update("password", fmt.Sprintf("%x", md5.Sum([]byte(*params.Password))))
	}
	if params.Enable != nil {
		orm.Update("enable", *params.Enable)
	}
	if params.Username != nil {
		orm.Update("username", *params.Username)
		db.Dao.Model(model.Profile{}).Where("userId=?", params.Id).Update("nickName", *params.Username)
	}
	if params.Role != nil {
		roleID, err := roleIDFor(db.Dao, *params.Role)
		if err != nil {
			Resp.Fail(c, ctx, err)
			return
		}
		// Replaced rather than added to: an account has one role, so a leftover
		// row from a database that predates that rule would otherwise keep an
		// account on the admin side after it was moved off it.
		db.Dao.Where("userId=?", params.Id).Delete(model.UserRolesRole{})
		db.Dao.Model(model.UserRolesRole{}).Create(&model.UserRolesRole{
			UserId: params.Id,
			RoleId: roleID,
		})
	}
	Resp.Succ(ctx, nil)
}

// Add creates an account.
//
// Everything happens in one transaction, the traffic plan included. It used to
// associate the plan *after* the transaction had committed, so a plan that
// could not be found reported "record not found" over an account that already
// existed — and that was every single create, because the console sends no
// plan id and plan 0 does not exist. The operator saw a failure, clicked
// again, and got a second account with the same name. Nothing rejected that:
// the `user` table has no unique key on username, and no primary key at all.
// A database full of same-named accounts is what that adds up to.
func (user) Add(c context.Context, ctx *app.RequestContext) {
	var params inout.AddUserReq
	if err := ctx.BindAndValidate(&params); err != nil {
		Resp.Fail(c, ctx, err)
		return
	}

	err := db.Dao.Transaction(func(tx *gorm.DB) error {
		// Enforced here because the table cannot enforce it: adding the unique
		// key that belongs on this column would fail on any database that has
		// already accumulated duplicates.
		var taken int64
		if err := tx.Model(&entity.User{}).Where("username = ?", params.Username).Count(&taken).Error; err != nil {
			return err
		}
		if taken > 0 {
			return apperr.Conflictf("用户名「%s」已存在", params.Username)
		}

		// The `user` table has no auto_increment, so the id is picked by hand.
		// FOR UPDATE serialises two concurrent creates, which would otherwise
		// both read the same max and write the same id.
		var maxID int
		if err := tx.Model(&entity.User{}).
			Clauses(clause.Locking{Strength: "UPDATE"}).
			Select("coalesce(max(id), 0)").
			Scan(&maxID).Error; err != nil {
			return err
		}
		newID := int32(maxID + 1)

		enable := int32(0)
		if params.Enable {
			enable = 1
		}
		now := time.Now()
		hashed := fmt.Sprintf("%x", md5.Sum([]byte(params.Password)))
		newUser := entity.User{
			ID:         &newID,
			Username:   &params.Username,
			Password:   &hashed,
			Enable:     &enable,
			CreateTime: &now,
			UpdateTime: &now,
		}

		// A plan is optional. An account created without one shows as 未关联 on
		// 转发用户 and is given a plan there; that is the normal path, and it
		// must not be reported as a failure.
		if params.PlanId != 0 {
			var plan entity.TrafficPlan
			if err := tx.Where("id = ?", params.PlanId).First(&plan).Error; err != nil {
				return apperr.NotFoundf("套餐 %d 不存在: %w", params.PlanId, err)
			}
			expiry := service.PlanPeriodEnd(now, plan.Period)
			newUser.PlanID = int64(params.PlanId)
			newUser.ExpirationTime = &expiry
			newUser.ResetTrafficTime = &expiry
		}

		// Omit the association, otherwise gorm tries to upsert an empty traffic plan.
		if err := tx.Omit("TrafficPlan").Create(&newUser).Error; err != nil {
			return err
		}
		if err := tx.Create(&model.Profile{
			ID:       int(newID),
			UserId:   int(newID),
			NickName: params.Username,
		}).Error; err != nil {
			return err
		}
		roleID, err := roleIDFor(tx, params.Role)
		if err != nil {
			return err
		}
		if err := tx.Create(&model.UserRolesRole{
			UserId: int(newID),
			RoleId: roleID,
		}).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		Resp.Fail(c, ctx, err)
		return
	}
	Resp.Succ(ctx, "")
}

func (user) Delete(c context.Context, ctx *app.RequestContext) {
	uid := ctx.Param("id")
	err := db.Dao.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id =?", uid).Delete(&entity.User{}).Error; err != nil {
			return err
		}
		if err := tx.Where("userId =?", uid).Delete(&model.UserRolesRole{}).Error; err != nil {
			return err
		}
		return tx.Where("userId =?", uid).Delete(&model.Profile{}).Error
	})
	if err != nil {
		Resp.Fail(c, ctx, err)
		return
	}
	Resp.Succ(ctx, "")
}

// roleIDFor resolves one of the two role codes to the id this database uses.
//
// The ids are not fixed. sql/init.sql seeds SUPER_ADMIN as 1 and USER as 4,
// but a database grown out of the naive-admin template may number them
// differently — which is why the code is the identifier everywhere above the
// join table, and the id is looked up here rather than written down.
func roleIDFor(tx *gorm.DB, code string) (int, error) {
	var role model.Role
	if err := tx.Model(model.Role{}).Where("code = ?", code).First(&role).Error; err != nil {
		return 0, fmt.Errorf("数据库里没有 %s 角色，先执行 sql/init.sql: %w", code, err)
	}
	return role.ID, nil
}
