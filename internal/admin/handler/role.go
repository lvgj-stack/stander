package handler

import (
	"context"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"
	"gorm.io/gorm"

	"github.com/lvgj-stack/stander/internal/admin/inout"
	"github.com/lvgj-stack/stander/internal/admin/model"
	"github.com/lvgj-stack/stander/internal/db"
)

var Role = &role{}

type role struct{}

func (role) PermissionsTree(c context.Context, ctx *app.RequestContext) {
	uid, _ := ctx.Get("uid")

	var adminRole int64
	db.Dao.Model(model.UserRolesRole{}).Where("userId=? and roleId=1", uid).Count(&adminRole)
	orm := db.Dao.Model(model.Permission{}).Where("parentId is NULL").Order("`order` Asc")

	if adminRole == 0 {
		uroleIdList := db.Dao.Model(model.UserRolesRole{}).Where("userId=?", uid).Select("roleId")
		rpermisId := db.Dao.Model(model.RolePermissionsPermission{}).Where("roleId in(?)", uroleIdList).Select("permissionId")
		orm = orm.Where("id in(?)", rpermisId)
	}

	var onePermissList []model.Permission
	orm.Find(&onePermissList)
	Resp.Succ(ctx, fillPermissionChildren(onePermissList))
}

func (role) List(c context.Context, ctx *app.RequestContext) {
	var data = &inout.RoleListRes{}
	db.Dao.Model(model.Role{}).Find(&data)
	Resp.Succ(ctx, data)
}

func (role) ListPage(c context.Context, ctx *app.RequestContext) {
	var data = &inout.RoleListPageRes{}
	name := ctx.DefaultQuery("name", "")
	enable := ctx.DefaultQuery("enable", "")
	pageNo, _ := strconv.Atoi(ctx.DefaultQuery("pageNo", "1"))
	pageSize, _ := strconv.Atoi(ctx.DefaultQuery("pageSize", "10"))

	orm := db.Dao.Model(model.Role{})
	if name != "" {
		orm = orm.Where("name like ?", "%"+name+"%")
	}
	if enable != "" {
		orm = orm.Where("enable = ?", enable == "1")
	}
	orm.Count(&data.Total)
	orm.Offset((pageNo - 1) * pageSize).Limit(pageSize).Find(&data.PageData)
	for i, datum := range data.PageData {
		var perIdList []int64
		db.Dao.Model(model.RolePermissionsPermission{}).Where("roleId=?", datum.ID).Select("permissionId").Find(&perIdList)
		data.PageData[i].PermissionIds = perIdList
	}
	Resp.Succ(ctx, data)
}

func (role) Update(c context.Context, ctx *app.RequestContext) {
	var params inout.PatchRoleReq
	if err := ctx.BindJSON(&params); err != nil {
		Resp.Err(ctx, 20001, err.Error())
		return
	}
	orm := db.Dao.Model(model.Role{}).Where("id=?", params.Id)
	if params.Name != nil {
		orm.Update("name", *params.Name)
	}
	if params.Enable != nil {
		orm.Update("enable", *params.Enable)
	}
	if params.Code != nil {
		orm.Update("code", *params.Code)
	}
	if params.PermissionIds != nil {
		db.Dao.Where("roleId=?", params.Id).Delete(model.RolePermissionsPermission{})
		for _, permissionId := range *params.PermissionIds {
			db.Dao.Model(model.RolePermissionsPermission{}).Create(&model.RolePermissionsPermission{
				PermissionId: permissionId,
				RoleId:       params.Id,
			})
		}
	}
	Resp.Succ(ctx, nil)
}

func (role) Add(c context.Context, ctx *app.RequestContext) {
	var params inout.AddRoleReq
	if err := ctx.BindAndValidate(&params); err != nil {
		Resp.Err(ctx, 20001, err.Error())
		return
	}
	err := db.Dao.Transaction(func(tx *gorm.DB) error {
		var record = model.Role{
			Code:   params.Code,
			Name:   params.Name,
			Enable: params.Enable,
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		for _, permissionId := range params.PermissionIds {
			if err := tx.Create(&model.RolePermissionsPermission{
				RoleId:       record.ID,
				PermissionId: permissionId,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		Resp.Err(ctx, 20001, err.Error())
		return
	}
	Resp.Succ(ctx, "")
}

func (role) Delete(c context.Context, ctx *app.RequestContext) {
	roleId := ctx.Param("id")
	err := db.Dao.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id =?", roleId).Delete(&model.Role{}).Error; err != nil {
			return err
		}
		if err := tx.Where("roleId =?", roleId).Delete(&model.UserRolesRole{}).Error; err != nil {
			return err
		}
		return tx.Where("roleId =?", roleId).Delete(&model.RolePermissionsPermission{}).Error
	})
	if err != nil {
		Resp.Err(ctx, 20001, err.Error())
		return
	}
	Resp.Succ(ctx, "")
}

func (role) AddUser(c context.Context, ctx *app.RequestContext) {
	var params inout.PatchRoleOpeateUserReq
	if err := ctx.BindJSON(&params); err != nil {
		Resp.Err(ctx, 20001, err.Error())
		return
	}
	params.Id, _ = strconv.Atoi(ctx.Param("id"))
	db.Dao.Where("userId in (?) and roleId = ?", params.UserIds, params.Id).Delete(model.UserRolesRole{})
	for _, userId := range params.UserIds {
		db.Dao.Model(model.UserRolesRole{}).Create(&model.UserRolesRole{
			UserId: userId,
			RoleId: params.Id,
		})
	}
	Resp.Succ(ctx, "")
}

func (role) RemoveUser(c context.Context, ctx *app.RequestContext) {
	var params inout.PatchRoleOpeateUserReq
	if err := ctx.BindJSON(&params); err != nil {
		Resp.Err(ctx, 20001, err.Error())
		return
	}
	params.Id, _ = strconv.Atoi(ctx.Param("id"))
	db.Dao.Where("userId in (?) and roleId = ?", params.UserIds, params.Id).Delete(model.UserRolesRole{})
	Resp.Succ(ctx, "")
}
