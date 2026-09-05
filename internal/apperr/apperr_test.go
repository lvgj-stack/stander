package apperr

import (
	"errors"
	"fmt"
	"testing"

	"gorm.io/gorm"
)

// The envelope code and the slug are a wire contract: the frontend branches on
// them and they appear in docs/api.md. Pinning them here means a reordering of
// the Kind constants — which are iota — cannot silently renumber every error
// the API has ever returned.
func TestKindWireValues(t *testing.T) {
	tests := []struct {
		kind Kind
		code int
		slug string
	}{
		{Internal, 500, "internal"},
		{InvalidArgument, 400, "invalid_argument"},
		{Unauthenticated, 401, "unauthenticated"},
		{PermissionDenied, 403, "permission_denied"},
		{NotFound, 404, "not_found"},
		{Conflict, 409, "conflict"},
		{FailedPrecondition, 422, "failed_precondition"},
		{Unavailable, 503, "unavailable"},
	}

	for _, tt := range tests {
		t.Run(tt.slug, func(t *testing.T) {
			if got := tt.kind.Code(); got != tt.code {
				t.Errorf("Code() = %d, want %d", got, tt.code)
			}
			if got := tt.kind.Slug(); got != tt.slug {
				t.Errorf("Slug() = %q, want %q", got, tt.slug)
			}
		})
	}

	// Nothing may collide with success.
	for _, tt := range tests {
		if tt.kind.Code() == 0 {
			t.Errorf("%s has code 0, which the client reads as success", tt.slug)
		}
	}
}

// Only our own faults get an error-level log line. If a caller mistyping a
// port were logged the same way, the log would be too noisy to find the real
// faults in — which is the whole reason for classifying.
func TestServerFault(t *testing.T) {
	ours := []Kind{Internal, Unavailable}
	theirs := []Kind{InvalidArgument, Unauthenticated, PermissionDenied, NotFound, Conflict, FailedPrecondition}

	for _, k := range ours {
		if !k.ServerFault() {
			t.Errorf("%s should be logged as our fault", k.Slug())
		}
	}
	for _, k := range theirs {
		if k.ServerFault() {
			t.Errorf("%s is the caller's mistake and must not be logged as a fault", k.Slug())
		}
	}
}

func TestFromClassifies(t *testing.T) {
	t.Run("nil stays nil", func(t *testing.T) {
		if From(nil) != nil {
			t.Fatal("From(nil) must be nil, or every success path allocates an error")
		}
	})

	t.Run("an *Error keeps its kind", func(t *testing.T) {
		if got := From(Conflictf("端口已占用")).Kind; got != Conflict {
			t.Fatalf("Kind = %v, want Conflict", got)
		}
	})

	// The handlers wrap service errors on the way out, so the classification
	// has to survive being buried.
	t.Run("a wrapped *Error keeps its kind", func(t *testing.T) {
		wrapped := fmt.Errorf("saving the rule: %w", Forbiddenf("没有权限"))
		if got := From(wrapped).Kind; got != PermissionDenied {
			t.Fatalf("Kind = %v, want PermissionDenied", got)
		}
	})

	// By far the most common ordinary failure. Reporting it as Internal would
	// bury real faults under "row not found".
	t.Run("gorm record-not-found becomes NotFound", func(t *testing.T) {
		if got := From(fmt.Errorf("loading: %w", gorm.ErrRecordNotFound)).Kind; got != NotFound {
			t.Fatalf("Kind = %v, want NotFound", got)
		}
	})

	t.Run("anything unrecognised is our fault", func(t *testing.T) {
		e := From(errors.New("connection reset by peer"))
		if e.Kind != Internal {
			t.Fatalf("Kind = %v, want Internal", e.Kind)
		}
		// The caller is told nothing about our internals; the detail is kept
		// for the log.
		if e.Message() != "服务器内部错误" {
			t.Errorf("Message() = %q, which leaks the underlying error to the caller", e.Message())
		}
		if e.Cause() == nil || e.Cause().Error() != "connection reset by peer" {
			t.Errorf("the cause must be kept for logging, got %v", e.Cause())
		}
	})
}

// %w in a constructor is how a caller passes the cause. It has to end up as a
// real wrapped error, not just text, or errors.Is stops working through it.
func TestConstructorUnwrapsTheCause(t *testing.T) {
	e := NotFoundf("节点 %d 不存在: %w", 7, gorm.ErrRecordNotFound)

	if e.Kind != NotFound {
		t.Fatalf("Kind = %v, want NotFound", e.Kind)
	}
	if !errors.Is(e, gorm.ErrRecordNotFound) {
		t.Error("errors.Is must see through to the cause")
	}
	if e.Message() != "节点 7 不存在: record not found" {
		t.Errorf("Message() = %q", e.Message())
	}
}

// A sentinel built by a constructor is compared by identity, which is how
// service.ErrForbidden is used.
func TestSentinelComparison(t *testing.T) {
	sentinel := Forbiddenf("没有权限执行该操作")
	if !errors.Is(fmt.Errorf("wrapped: %w", sentinel), sentinel) {
		t.Fatal("a sentinel must survive wrapping")
	}
}
