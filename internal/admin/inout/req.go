package inout

// Validation note: these structs used gin's `binding:"required"` tag. Hertz's
// binder ignores it and validates through `vd` instead, so the rules were
// translated. Two gin quirks were dropped rather than reproduced: `required` on
// a bool rejected the value false, which made it impossible to create a
// disabled user or role.

type LoginReq struct {
	Username string `form:"username" json:"username" vd:"len($)>0"`
	Password string `form:"password" json:"password" vd:"len($)>0"`
	Captcha  string `form:"captcha" json:"captcha" vd:"len($)>0"`
}
type AuthPwReq struct {
	NewPassword string `form:"newPassword" json:"newPassword" vd:"len($)>0"`
	OldPassword string `form:"oldPassword" json:"oldPassword" vd:"len($)>0"`
}
type PatchUserReq struct {
	Id          int     `json:"id" vd:"$>0"`
	Enable      *bool   `json:"enable,omitempty"`
	RoleIds     *[]int  `json:"roleIds,omitempty"`
	Password    *string `json:"password,omitempty"`
	Username    *string `json:"username,omitempty"`
	OldPassword *string `json:"oldPassword,omitempty"`
	NewPassword *string `json:"newPassword,omitempty"`
}
type PatchProfileUserReq struct {
	Id       int    `json:"id" vd:"$>0"`
	Gender   int    `json:"gender"`
	NickName string `json:"nickName"`
	Address  string `json:"address"`
	Email    string `json:"email"`
	Avatar   string `json:"avatar"`
}
type EnableRoleReq struct {
	Enable bool `json:"enable"`
	Id     int  `json:"id"`
}

type AddUserReq struct {
	Username string `json:"username" vd:"len($)>0"`
	Password string `json:"password" vd:"len($)>0"`
	Enable   bool   `json:"enable"`
	RoleIds  []int  `json:"roleIds" vd:"len($)>0"`
	PlanId   int32  `json:"planId"`
}

type AddRoleReq struct {
	Code          string `json:"code" vd:"len($)>0"`
	Enable        bool   `json:"enable"`
	Name          string `json:"name" vd:"len($)>0"`
	PermissionIds []int  `json:"permissionIds"`
}
type PatchRoleReq struct {
	Id            int     `json:"id" vd:"$>0"`
	Code          *string `json:"code,omitempty"`
	Enable        *bool   `json:"enable,omitempty"`
	Name          *string `json:"name,omitempty"`
	PermissionIds *[]int  `json:"permissionIds,omitempty"`
}

type PatchRoleOpeateUserReq struct {
	Id      int   `json:"id" `
	UserIds []int `json:"userIds"`
}

type AddPermissionReq struct {
	Type      string `json:"type" vd:"len($)>0"`
	ParentId  *int   `json:"parentId"`
	Name      string `json:"name" vd:"len($)>0"`
	Code      string `json:"code" vd:"len($)>0"`
	Path      string `json:"path"`
	Icon      string `json:"icon"`
	Layout    string `json:"layout"`
	Component string `json:"component"`
	Show      bool   `json:"show"`
	Enable    bool   `json:"enable"`
	KeepAlive bool   `json:"keepAlive"`
	Order     int    `json:"order"`
}

type PatchPermissionReq struct {
	Id        int    `json:"id" vd:"$>0"`
	Type      string `json:"type" vd:"len($)>0"`
	ParentId  *int   `json:"parentId"`
	Name      string `json:"name" vd:"len($)>0"`
	Code      string `json:"code" vd:"len($)>0"`
	Path      string `json:"path"`
	Icon      string `json:"icon"`
	Layout    string `json:"layout"`
	Component string `json:"component"`
	Show      int    `json:"show"`
	Enable    int    `json:"enable"`
	KeepAlive int    `json:"keepAlive"`
	Order     int    `json:"order"`
}
