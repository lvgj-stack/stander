package utils

import "testing"

func TestCaptchaGenerateProducesImage(t *testing.T) {
	id, b64s, err := GetCaptcha()
	if err != nil {
		t.Fatalf("GetCaptcha: %v", err)
	}
	if id == "" {
		t.Error("captcha id must not be empty")
	}
	if len(b64s) < len("data:image/png;base64,") || b64s[:11] != "data:image/" {
		t.Errorf("expected a data URI, got %.32q", b64s)
	}
}

// The store consumes the answer on a successful verify, so a replayed captcha
// must fail. This is what stops a captured login form being reused.
func TestVerifyCaptchaRejectsUnknownID(t *testing.T) {
	if VerifyCaptcha("no-such-id", "abcd") {
		t.Error("an unknown captcha id must not verify")
	}
}

func TestVerifyCaptchaRejectsWrongAnswer(t *testing.T) {
	id, _, err := GetCaptcha()
	if err != nil {
		t.Fatalf("GetCaptcha: %v", err)
	}
	if VerifyCaptcha(id, "definitely-not-the-answer") {
		t.Error("a wrong answer must not verify")
	}
}
