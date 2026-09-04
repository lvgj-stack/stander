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

var Permissions = &permissions{}

type permissions struct{}

// fillPermissionChildren attaches the second and third level of the permission
// tree to the given roots. Shared by the permission list and the role's
// permission tree, which built the same three-level walk twice.
func fillPermissionChildren(roots []model.Permission) []model.Permission {
	for i, root := range roots {
		var children []model.Permission
		db.Dao.Model(model.Permission{}).Where("parentId = ?", root.ID).Order("`order` Asc").Find(&children)
		for j, child := range children {
			var grandChildren []model.Permission
			db.Dao.Model(model.Permission{}).Where("parentId = ?", child.ID).Order("`order` Asc").Find(&grandChildren)
			children[j].Children = grandChildren
		}
		roots[i].Children = children
	}
	return roots
}

func (permissions) List(c context.Context, ctx *app.RequestContext) {
	var roots = make([]model.Permission, 0)
	db.Dao.Model(model.Permission{}).Where("parentId is NULL").Order("`order` Asc").Find(&roots)
	Resp.Succ(ctx, fillPermissionChildren(roots))
}

func (permissions) ListPage(c context.Context, ctx *app.RequestContext) {
	var data = &inout.RoleListPageRes{}
	name := ctx.DefaultQuery("name", "")
	pageNo, _ := strconv.Atoi(ctx.DefaultQuery("pageNo", "1"))
	pageSize, _ := strconv.Atoi(ctx.DefaultQuery("pageSize", "10"))

	orm := db.Dao.Model(model.Role{})
	if name != "" {
		orm = orm.Where("name like ?", "%"+name+"%")
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

func (permissions) Add(c context.Context, ctx *app.RequestContext) {
	var params inout.AddPermissionReq
	if err := ctx.BindAndValidate(&params); err != nil {
		Resp.Err(ctx, 20001, err.Error())
		return
	}
	err := db.Dao.Model(model.Permission{}).Create(&model.Permission{
		Name:      params.Name,
		Code:      params.Code,
		Type:      params.Type,
		ParentId:  params.ParentId,
		Path:      params.Path,
		Icon:      params.Icon,
		Component: params.Component,
		Layout:    params.Layout,
		KeepAlive: boolToInt(params.KeepAlive),
		Show:      boolToInt(params.Show),
		Enable:    boolToInt(params.Enable),
		Order:     params.Order,
	}).Error
	if err != nil {
		Resp.Err(ctx, 20001, err.Error())
		return
	}
	Resp.Succ(ctx, "")
}

func (permissions) Delete(c context.Context, ctx *app.RequestContext) {
	id := ctx.Param("id")
	err := db.Dao.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id =?", id).Delete(&model.Permission{}).Error; err != nil {
			return err
		}
		return tx.Where("permissionId =?", id).Delete(&model.RolePermissionsPermission{}).Error
	})
	if err != nil {
		Resp.Err(ctx, 20001, err.Error())
		return
	}
	Resp.Succ(ctx, "")
}

func (permissions) PatchPermission(c context.Context, ctx *app.RequestContext) {
	var params inout.PatchPermissionReq
	if err := ctx.BindJSON(&params); err != nil {
		Resp.Err(ctx, 20001, err.Error())
		return
	}
	err := db.Dao.Model(model.Permission{}).Where("id=?", params.Id).Updates(model.Permission{
		Name:      params.Name,
		Code:      params.Code,
		Type:      params.Type,
		ParentId:  params.ParentId,
		Path:      params.Path,
		Icon:      params.Icon,
		Component: params.Component,
		Layout:    params.Layout,
		KeepAlive: params.KeepAlive,
		Method:    params.Component,
		Show:      params.Show,
		Enable:    params.Enable,
		Order:     params.Order,
	}).Error
	if err != nil {
		Resp.Err(ctx, 20001, err.Error())
		return
	}
	Resp.Succ(ctx, "")
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

func (permissions) Button(c context.Context, ctx *app.RequestContext) {
	Resp.Succ(ctx, "")
}
