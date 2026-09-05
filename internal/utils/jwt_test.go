package utils

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v4"
)

func TestTokenRoundTrip(t *testing.T) {
	SetJWTSigningKey("test-signing-key")

	token := GenerateToken(7, 7, "admin", "SUPER_ADMIN")
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
}

// The claim keeps its `currentRoleCode` name across the drop of the roleCodes
// array. Renaming it would leave every already-issued token resolving to no
// role — which the backend reads as a non-admin, silently demoting every
// signed-in administrator until their token expired.
func TestTokenClaimNameIsStable(t *testing.T) {
	SetJWTSigningKey("test-signing-key")

	payload := GenerateToken(7, 7, "admin", "SUPER_ADMIN")
	parts := strings.Split(payload, ".")
	if len(parts) != 3 {
		t.Fatalf("not a JWT: %q", payload)
	}
	body, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("decode payload: %v", err)
	}

	var claims map[string]any
	if err := json.Unmarshal(body, &claims); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	if claims["currentRoleCode"] != "SUPER_ADMIN" {
		t.Errorf("currentRoleCode claim: got %v, want SUPER_ADMIN", claims["currentRoleCode"])
	}
	if _, ok := claims["roleCodes"]; ok {
		t.Error("roleCodes is gone: an account has one role")
	}
}

// SetJWTSigningKey ignores an empty key so that a missing config entry cannot
// silently invalidate tokens already in the wild.
func TestSetJWTSigningKeyIgnoresEmpty(t *testing.T) {
	SetJWTSigningKey("original-key")
	token := GenerateToken(1, 1, "u", "USER")

	SetJWTSigningKey("")
	if _, err := NewJWT().ParseToken(token); err != nil {
		t.Fatalf("token minted before the empty SetJWTSigningKey should still parse: %v", err)
	}
}

func TestParseTokenRejectsAnotherKey(t *testing.T) {
	SetJWTSigningKey("key-a")
	token := GenerateToken(1, 1, "u", "USER")

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
