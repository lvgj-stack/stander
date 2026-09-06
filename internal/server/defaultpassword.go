package server

import (
	"context"
	"strings"

	"github.com/cloudwego/hertz/pkg/common/hlog"

	"github.com/lvgj-stack/stander/internal/model/dal"
	"github.com/lvgj-stack/stander/internal/model/entity"
	"github.com/lvgj-stack/stander/internal/utils"
)

// seededPassword is what sql/init.sql gives every account it creates. It is in
// the repository, so it is public knowledge: any deployment that still has it
// is one `curl` away from being logged into by anyone who found the project.
const seededPassword = "123456"

// warnSeededPasswords logs a warning naming every enabled account still on the
// seeded password.
//
// The console shows the credentials on the login page and the README prints
// them in the quick start, so an operator meets them once, during setup, at the
// moment they are least inclined to stop. This says it again on every boot,
// where it is in front of whoever is actually running the thing — and keeps
// saying it until the password is changed, which is the only thing that
// silences it.
//
// A failure to look is not a failure to start: the check is advisory, and a
// database that cannot answer this query has bigger problems that the requests
// right behind it will report properly.
func warnSeededPasswords(ctx context.Context) {
	users, err := dal.User.WithContext(ctx).
		Select(dal.User.Username, dal.User.Password, dal.User.Enable).
		Find()
	if err != nil {
		hlog.Warnf("could not check for default passwords: %v", err)
		return
	}
	if names := seededPasswordAccounts(users); len(names) > 0 {
		hlog.Warnf(
			"账号 %s 还在用 sql/init.sql 里的默认口令（%s）。这个口令在仓库里是公开的，"+
				"请立刻登录后在「个人资料 › 修改密码」改掉。",
			strings.Join(names, "、"), seededPassword,
		)
	}
}

// seededPasswordAccounts returns the usernames of enabled accounts whose
// password is still the seeded one, in the order given.
//
// Disabled accounts are left out on purpose: they cannot be logged into, so
// naming them would add noise to a warning whose whole value is that it only
// appears when something needs doing.
func seededPasswordAccounts(users []*entity.User) []string {
	hashed := utils.Md5Hash(seededPassword)
	var names []string
	for _, u := range users {
		if u == nil || u.Password == nil || *u.Password != hashed {
			continue
		}
		if u.Enable == nil || *u.Enable == 0 {
			continue
		}
		name := "(未命名)"
		if u.Username != nil {
			name = *u.Username
		}
		names = append(names, name)
	}
	return names
}
