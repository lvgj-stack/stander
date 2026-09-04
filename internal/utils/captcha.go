package utils

import (
	"sync"

	"github.com/mojocn/base64Captcha"
)

// store holds captcha answers between /auth/captcha and /auth/login.
//
// It defaults to base64Captcha's in-memory store, which only works when both
// requests land on the same process. SetCaptchaStore swaps in a shared store so
// the API can run more than one replica — see internal/captcha.
var (
	storeMu sync.RWMutex
	store   base64Captcha.Store = base64Captcha.DefaultMemStore
)

// SetCaptchaStore replaces the captcha store. A nil store is ignored so a
// wiring mistake cannot silently disable captcha verification.
func SetCaptchaStore(s base64Captcha.Store) {
	if s == nil {
		return
	}
	storeMu.Lock()
	defer storeMu.Unlock()
	store = s
}

func currentStore() base64Captcha.Store {
	storeMu.RLock()
	defer storeMu.RUnlock()
	return store
}

// GetCaptcha returns the captcha id and its base64-encoded image. The driver
// also hands back the plain answer, which is deliberately discarded here: the
// answer lives in the store and is checked by VerifyCaptcha.
func GetCaptcha() (string, string, error) {
	driver := &base64Captcha.DriverString{
		Length:          4,
		Height:          40,
		Width:           80,
		ShowLineOptions: base64Captcha.OptionShowHollowLine,
		NoiseCount:      0,
		Source:          "1234567890qwertyuioplkjhgfdsazxcvbnm",
	}

	c := base64Captcha.NewCaptcha(driver, currentStore())
	id, b64s, _, err := c.Generate()
	return id, b64s, err
}

// VerifyCaptcha consumes the answer: a captcha is single-use, so a captured
// login form cannot be replayed.
func VerifyCaptcha(id, answer string) bool {
	return currentStore().Verify(id, answer, true)
}
