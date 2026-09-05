package inout

import (
	"encoding/json"
	"sort"
	"testing"
	"time"

	"github.com/lvgj-stack/stander/internal/model/entity"
)

// UserDetailRes used to inherit its JSON keys from an embedded second model of
// the `user` table. That model is gone, so this pins the exact key set the
// admin console has always received. Adding or renaming a key here is a
// frontend-visible change and should be a deliberate one.
func TestUserDetailResJSONShape(t *testing.T) {
	// `roles` and `currentRole` collapsed into one `role`: an account has one
	// role and cannot switch, so the array and the "which of them is active"
	// pointer had nothing left to express.
	want := []string{
		"createTime", "enable", "id",
		"password", "profile", "role", "updateTime", "username",
	}

	raw, err := json.Marshal(UserDetailRes{})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got map[string]json.RawMessage
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	keys := make([]string, 0, len(got))
	for k := range got {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	if len(keys) != len(want) {
		t.Fatalf("key set changed:\n got %v\nwant %v", keys, want)
	}
	for i := range want {
		if keys[i] != want[i] {
			t.Fatalf("key set changed:\n got %v\nwant %v", keys, want)
		}
	}
}

func TestNewUserDetailResMapsEntity(t *testing.T) {
	id := int32(7)
	username := "admin"
	password := "53d3c4c5c5f07891133f49250f6f13d9"
	enable := int32(1)
	created := time.Date(2024, 10, 12, 8, 7, 1, 0, time.UTC)
	updated := time.Date(2025, 1, 1, 15, 16, 21, 0, time.UTC)

	got := NewUserDetailRes(&entity.User{
		ID:         &id,
		Username:   &username,
		Password:   &password,
		Enable:     &enable,
		CreateTime: &created,
		UpdateTime: &updated,
	})

	if got.ID != 7 || got.Username != "admin" || got.Password != password {
		t.Errorf("scalar fields not mapped: %+v", got)
	}
	if !got.Enable {
		t.Error("enable=1 must map to true")
	}
	if !got.CreateTime.Equal(created) || !got.UpdateTime.Equal(updated) {
		t.Errorf("timestamps not mapped: %v / %v", got.CreateTime, got.UpdateTime)
	}
}

// Every column on the gorm-gen entity is a pointer, so a row with NULLs must
// not panic the mapper.
func TestNewUserDetailResHandlesNulls(t *testing.T) {
	got := NewUserDetailRes(&entity.User{})
	if got.ID != 0 || got.Username != "" || got.Enable {
		t.Errorf("NULL columns should map to zero values, got %+v", got)
	}

	if got := NewUserDetailRes(nil); got == nil {
		t.Fatal("a nil entity must still yield a usable response")
	}
}

func TestEnableZeroMapsToFalse(t *testing.T) {
	enable := int32(0)
	if NewUserDetailRes(&entity.User{Enable: &enable}).Enable {
		t.Error("enable=0 must map to false")
	}
}

// UserListItem is built by hand in the handler; this pins its keys too.
func TestUserListItemJSONShape(t *testing.T) {
	raw, err := json.Marshal(UserListItem{})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got map[string]json.RawMessage
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	for _, k := range []string{"id", "username", "enable", "createTime", "updateTime", "gender", "avatar", "address", "email", "role"} {
		if _, ok := got[k]; !ok {
			t.Errorf("UserListItem lost the %q key", k)
		}
	}
	if _, ok := got["roles"]; ok {
		t.Error("the roles array is gone: an account has one role")
	}
}
