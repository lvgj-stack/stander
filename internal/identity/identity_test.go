package identity

import (
	"context"
	"testing"
)

func TestRoundTrip(t *testing.T) {
	want := Principal{UserID: 7, RoleCode: "USER"}
	got := FromContext(NewContext(context.Background(), want))
	if got != want {
		t.Errorf("got %+v, want %+v", got, want)
	}
}

// An unauthenticated call must degrade to a principal that passes no
// permission check, never to a panic or a super-admin.
func TestAbsentPrincipalIsZero(t *testing.T) {
	got := FromContext(context.Background())
	if got != (Principal{}) {
		t.Errorf("got %+v, want the zero Principal", got)
	}
	if got.IsSuperAdmin() {
		t.Error("a caller with no identity must not be super admin")
	}
}

func TestIsSuperAdmin(t *testing.T) {
	tests := []struct {
		role string
		want bool
	}{
		{RoleSuperAdmin, true},
		{"USER", false},
		{"", false},
		{"super_admin", false},
	}
	for _, tt := range tests {
		if got := (Principal{RoleCode: tt.role}).IsSuperAdmin(); got != tt.want {
			t.Errorf("role %q: got %v, want %v", tt.role, got, tt.want)
		}
	}
}

// A value stashed under a different key must not be mistaken for a principal.
func TestForeignContextValueIsIgnored(t *testing.T) {
	type otherKey struct{}
	ctx := context.WithValue(context.Background(), otherKey{}, Principal{RoleCode: RoleSuperAdmin})
	if FromContext(ctx).IsSuperAdmin() {
		t.Error("a value under a foreign key must not be read as the principal")
	}
}
