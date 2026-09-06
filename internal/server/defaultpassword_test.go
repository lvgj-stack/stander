package server

import (
	"reflect"
	"testing"

	"github.com/lvgj-stack/stander/internal/model/entity"
	"github.com/lvgj-stack/stander/internal/utils"
)

func user(name, password string, enable int32) *entity.User {
	return &entity.User{Username: &name, Password: &password, Enable: &enable}
}

func TestSeededPasswordAccounts(t *testing.T) {
	seeded := utils.Md5Hash(seededPassword)
	changed := utils.Md5Hash("something-else")

	tests := []struct {
		name  string
		users []*entity.User
		want  []string
	}{
		{
			name:  "名出所有还在用默认口令的启用账号",
			users: []*entity.User{user("admin", seeded, 1), user("user01", seeded, 1)},
			want:  []string{"admin", "user01"},
		},
		{
			name:  "改过口令的不再出现",
			users: []*entity.User{user("admin", changed, 1), user("user01", seeded, 1)},
			want:  []string{"user01"},
		},
		{
			// 停用的账号登不进来，点名它只会让这条警告变成每次启动都出现的噪音，
			// 而它的全部价值就在于「出现了就是真有事要做」。
			name:  "停用的账号不算",
			users: []*entity.User{user("admin", seeded, 0)},
			want:  nil,
		},
		{
			name:  "全都改过就一个都不报",
			users: []*entity.User{user("admin", changed, 1)},
			want:  nil,
		},
		{
			// 库里这几列都是可空的，产物里因此是指针。少一个 nil 判断，
			// 一次启动就会 panic 在一条只是想提个醒的检查上。
			name:  "空指针不 panic",
			users: []*entity.User{nil, {}, user("admin", seeded, 1)},
			want:  []string{"admin"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := seededPasswordAccounts(tt.users); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("seededPasswordAccounts() = %v, want %v", got, tt.want)
			}
		})
	}
}

// The hash in sql/init.sql is a literal, so nothing links it to the constant
// here. If the seed is ever changed without changing this, the warning goes
// quiet on exactly the deployments it exists for.
func TestSeededPasswordMatchesInitSQL(t *testing.T) {
	const inInitSQL = "e10adc3949ba59abbe56e057f20f883e"
	if got := utils.Md5Hash(seededPassword); got != inInitSQL {
		t.Errorf("Md5Hash(%q) = %s, want %s（和 sql/init.sql 里 admin 的 password 一致）",
			seededPassword, got, inInitSQL)
	}
}
