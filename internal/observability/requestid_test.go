package observability

import (
	"context"
	"strings"
	"testing"
)

// The inbound header is attacker-controlled and lands in both a log line and a
// response header, so anything that could forge a log entry or split a header
// has to be replaced rather than escaped.
func TestSanitizeRequestID(t *testing.T) {
	generated := func(t *testing.T, got, raw string) {
		t.Helper()
		if got == raw {
			t.Fatalf("SanitizeRequestID(%q) passed the value through; it must mint a fresh one", raw)
		}
		if len(got) != len(NewRequestID()) {
			t.Fatalf("expected a generated uuid, got %q", got)
		}
	}

	t.Run("a plausible id is honoured", func(t *testing.T) {
		for _, raw := range []string{
			"3f2504e0-4f89-11d3-9a0c-0305e82c3301", // uuid
			"0af7651916cd43dd8448eb211c80319c",     // w3c trace id
			"req_01HZX.9-A:B",                      // prefixed id with the allowed punctuation
		} {
			if got := SanitizeRequestID(raw); got != raw {
				t.Errorf("SanitizeRequestID(%q) = %q, want it kept", raw, got)
			}
		}
	})

	t.Run("an absent or blank header gets a fresh id", func(t *testing.T) {
		for _, raw := range []string{"", "   ", "\t"} {
			got := SanitizeRequestID(raw)
			if got == "" {
				t.Fatalf("SanitizeRequestID(%q) returned empty; every request needs an id", raw)
			}
		}
	})

	t.Run("a log-forging or header-splitting value is discarded", func(t *testing.T) {
		for _, raw := range []string{
			"abc\nrequest_id=deadbeef status=200", // forge a second log line
			"abc\r\nSet-Cookie: admin=1",          // split the response header
			"abc def",                             // whitespace breaks key=value parsing
			"abc\x00def",                          // NUL
			"<script>alert(1)</script>",           // markup
			"id/with/slashes",                     // outside the allowed set
		} {
			generated(t, SanitizeRequestID(raw), raw)
		}
	})

	t.Run("an over-long value is discarded", func(t *testing.T) {
		raw := strings.Repeat("a", maxRequestIDLen+1)
		generated(t, SanitizeRequestID(raw), raw)

		// The boundary itself is still accepted.
		ok := strings.Repeat("a", maxRequestIDLen)
		if got := SanitizeRequestID(ok); got != ok {
			t.Errorf("a %d-character id should be accepted, got %q", maxRequestIDLen, got)
		}
	})
}

func TestNewRequestIDIsUnique(t *testing.T) {
	seen := make(map[string]bool, 1000)
	for range 1000 {
		id := NewRequestID()
		if seen[id] {
			t.Fatalf("NewRequestID repeated %q", id)
		}
		seen[id] = true
	}
}

func TestRequestIDContextRoundTrip(t *testing.T) {
	ctx := NewRequestIDContext(context.Background(), "abc123")
	if got := RequestIDFromContext(ctx); got != "abc123" {
		t.Fatalf("RequestIDFromContext() = %q, want abc123", got)
	}

	// A background job or a unit test has no request behind it, and must not
	// panic for asking.
	if got := RequestIDFromContext(context.Background()); got != "" {
		t.Fatalf("an id-less context should yield \"\", got %q", got)
	}
}
