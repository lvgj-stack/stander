package inout

// Validation note: these structs used gin's `binding:"required"` tag. Hertz's
// binder ignores it and validates through `vd` instead, so the rules were
// translated. Two gin quirks were dropped rather than reproduced: `required` on
// a bool rejected the value false, which made it impossible to create a
// disabled user or role.

type LoginReq struct {
	Username string `form:"username" json:"username" vd:"len($)>0"`
	Password string `form:"password" json:"password" vd:"len($)>0"`
}
type AuthPwReq struct {
	NewPassword string `form:"newPassword" json:"newPassword" vd:"len($)>0"`
	OldPassword string `form:"oldPassword" json:"oldPassword" vd:"len($)>0"`
}
type PatchUserReq struct {
	Id          int     `json:"id" vd:"$>0"`
	Enable      *bool   `json:"enable,omitempty"`
	Role        *string `json:"role,omitempty" vd:"$==nil||($=='SUPER_ADMIN'||$=='USER')"`
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
type AddUserReq struct {
	Username string `json:"username" vd:"len($)>0"`
	Password string `json:"password" vd:"len($)>0"`
	Enable   bool   `json:"enable"`
	Role     string `json:"role" vd:"$=='SUPER_ADMIN'||$=='USER'"`
	PlanId   int32  `json:"planId"`
}
