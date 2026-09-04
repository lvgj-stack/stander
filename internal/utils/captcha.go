package utils

import (
	"github.com/mojocn/base64Captcha"
)

var store = base64Captcha.DefaultMemStore

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

	c := base64Captcha.NewCaptcha(driver, store)
	id, b64s, _, err := c.Generate()
	return id, b64s, err
}

func VerifyCaptcha(id, VerifyValue string) bool {
	return store.Verify(id, VerifyValue, true)
}
