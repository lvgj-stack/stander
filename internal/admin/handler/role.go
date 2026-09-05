package handler

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/lvgj-stack/stander/internal/admin/inout"
	"github.com/lvgj-stack/stander/internal/admin/model"
	"github.com/lvgj-stack/stander/internal/db"
)

var Role = &role{}

type role struct{}

// List returns every role.
//
// This is all that is left of role management. Roles used to be editable, and
// each one carried a set of permission rows that the previous Vue frontend
// turned into menu entries and tabs at runtime. The console now has exactly
// two fixed sides — the admin console for SUPER_ADMIN, the user portal for
// everyone else — so the only thing a role still decides is which side an
// account lands on, and the account form needs this list to offer that choice.
func (role) List(c context.Context, ctx *app.RequestContext) {
	var data = &inout.RoleListRes{}
	db.Dao.Model(model.Role{}).Find(&data)
	Resp.Succ(ctx, data)
}
