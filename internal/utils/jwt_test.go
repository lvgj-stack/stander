package utils

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v4"
)

func TestTokenRoundTrip(t *testing.T) {
	SetJWTSigningKey("test-signing-key")

	token := GenerateToken(7, 7, "admin", "SUPER_ADMIN", []string{"SUPER_ADMIN", "USER"})
	claims, err := NewJWT().ParseToken(token)
	if err != nil {
		t.Fatalf("ParseToken: %v", err)
	}
	if claims.UID != 7 || claims.UserId != 7 {
		t.Errorf("uid round trip: got %d/%d, want 7/7", claims.UID, claims.UserId)
	}
	if claims.Username != "admin" {
		t.Errorf("username: got %q, want admin", claims.Username)
	}
	if claims.CurrentRoleCode != "SUPER_ADMIN" {
		t.Errorf("current role: got %q, want SUPER_ADMIN", claims.CurrentRoleCode)
	}
	if len(claims.RoleCodes) != 2 {
		t.Errorf("role codes: got %v, want two entries", claims.RoleCodes)
	}
}

// SetJWTSigningKey ignores an empty key so that a missing config entry cannot
// silently invalidate tokens already in the wild.
func TestSetJWTSigningKeyIgnoresEmpty(t *testing.T) {
	SetJWTSigningKey("original-key")
	token := GenerateToken(1, 1, "u", "USER", nil)

	SetJWTSigningKey("")
	if _, err := NewJWT().ParseToken(token); err != nil {
		t.Fatalf("token minted before the empty SetJWTSigningKey should still parse: %v", err)
	}
}

func TestParseTokenRejectsAnotherKey(t *testing.T) {
	SetJWTSigningKey("key-a")
	token := GenerateToken(1, 1, "u", "USER", nil)

	SetJWTSigningKey("key-b")
	if _, err := NewJWT().ParseToken(token); err == nil {
		t.Fatal("a token signed with a different key must not parse")
	}
}

func TestParseTokenRejectsExpired(t *testing.T) {
	SetJWTSigningKey("test-signing-key")

	j := NewJWT()
	expired := jwt.NewWithClaims(jwt.SigningMethodHS256, CustomClaims{
		UID: 1,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
		},
	})
	signed, err := expired.SignedString(j.SigningKey)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	if _, err := j.ParseToken(signed); err != TokenExpired {
		t.Fatalf("got %v, want TokenExpired", err)
	}
}

func TestParseTokenRejectsGarbage(t *testing.T) {
	SetJWTSigningKey("test-signing-key")
	if _, err := NewJWT().ParseToken("not.a.token"); err == nil {
		t.Fatal("garbage must not parse")
	}
}
