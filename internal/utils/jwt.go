package utils

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v4"
)

// 一些常量
var (
	TokenExpired     error = errors.New("token is expired")
	TokenNotValidYet error = errors.New("token not active yet")
	TokenMalformed   error = errors.New("that's not even a token")
	TokenInvalid     error = errors.New("couldn't handle this token")
)

// CustomClaims 载荷，可以加一些自己需要的信息
//
// An account has exactly one role (identity.RoleSuperAdmin or
// identity.RoleUser), so the token carries one. It used to carry a roleCodes
// array as well, from the days when an account could hold several and switch
// between them; the middleware only ever copied CurrentRoleCode into
// identity.Principal, so the array authorized nothing.
//
// The JSON name stays `currentRoleCode` on purpose: renaming it would make
// every already-issued token resolve to no role, which the backend reads as a
// non-admin — silently demoting every signed-in administrator until their
// token expired.
type CustomClaims struct {
	UID             int    `json:"UID,omitempty"`
	UserId          int    `json:"userId,omitempty"`
	Username        string `json:"username,omitempty"`
	CurrentRoleCode string `json:"currentRoleCode,omitempty"`
	jwt.RegisteredClaims
}

// JWT 签名结构
type JWT struct {
	SigningKey []byte `json:"signing_key"`
}

// signingKey is set once at startup from config. It falls back to the
// JWT_SIGNING_KEY environment variable so existing deployments keep working.
var signingKey = os.Getenv("JWT_SIGNING_KEY")

// SetJWTSigningKey overrides the signing key. An empty key is ignored so that a
// missing config entry does not silently invalidate every issued token.
func SetJWTSigningKey(key string) {
	if key != "" {
		signingKey = key
	}
}

// NewJWT 新建一个jwt实例
func NewJWT() *JWT {
	return &JWT{
		SigningKey: []byte(signingKey),
	}
}

// createToken 生成一个token
func (j *JWT) createToken(claims CustomClaims) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(j.SigningKey)
}

// GenerateToken 生成令牌
func GenerateToken(uId, userId int, username, roleCode string) string {
	j := NewJWT()
	claims := CustomClaims{
		UID:             uId,
		UserId:          userId,
		Username:        username,
		CurrentRoleCode: roleCode,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * 30 * time.Hour)),
		},
	}

	token, err := j.createToken(claims)
	if err != nil {

		return err.Error()
	}
	//log.Println("--->生成的token-->：" + token)
	return token
}

// RefreshToken 更新token
func (j *JWT) RefreshToken(tokenString string) (string, error) {
	jwt.TimeFunc = func() time.Time {
		return time.Unix(0, 0)
	}
	token, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, func(token *jwt.Token) (interface{}, error) {
		return j.SigningKey, nil
	})
	if err != nil {
		return "", err
	}
	if claims, ok := token.Claims.(*CustomClaims); ok && token.Valid {
		jwt.TimeFunc = time.Now
		claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(time.Hour))
		return j.createToken(*claims)
	}
	return "", TokenInvalid
}

// ParseToken 解析 Tokne
func (j *JWT) ParseToken(tokenString string) (*CustomClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, func(token *jwt.Token) (interface{}, error) {
		return j.SigningKey, nil
	})
	if err != nil {
		if ve, ok := err.(*jwt.ValidationError); ok {
			if ve.Errors&jwt.ValidationErrorMalformed != 0 {
				return nil, TokenMalformed
			} else if ve.Errors&jwt.ValidationErrorExpired != 0 {
				// Token is expired
				return nil, TokenExpired
			} else if ve.Errors&jwt.ValidationErrorNotValidYet != 0 {
				return nil, TokenNotValidYet
			} else {
				return nil, TokenInvalid
			}
		}
	}
	if token == nil {
		return nil, TokenInvalid
	}
	if claims, ok := token.Claims.(*CustomClaims); ok && token.Valid {
		return claims, nil
	}
	return nil, TokenInvalid
}
