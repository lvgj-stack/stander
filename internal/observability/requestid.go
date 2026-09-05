package observability

import (
	"context"
	"strings"

	"github.com/google/uuid"
)

// RequestIDHeader carries a request id in and out.
//
// Inbound it lets a caller — an ingress, another service, an agent — tie its
// own logs to ours. Outbound it is echoed on every response and repeated in
// the response envelope, so a user reporting a failure can quote one string
// that finds the exact request in the logs.
const RequestIDHeader = "X-Request-Id"

// RequestIDCtxKey is where the id is stashed on the web framework's own
// per-request context.
//
// It lives here, rather than in either package that uses it, because both the
// middleware that sets it (api) and the envelope writers that read it
// (internal/admin/handler) need the same string, and api already imports
// handler — defining it in either one would close an import cycle.
const RequestIDCtxKey = "request_id"

// maxRequestIDLen caps what an inbound header may contribute. A caller
// supplies this value, and it ends up in log lines and a response header.
const maxRequestIDLen = 64

type requestIDKey struct{}

// NewRequestIDContext returns a copy of ctx carrying id.
func NewRequestIDContext(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey{}, id)
}

// RequestIDFromContext returns the id carried by ctx, or "" when there is
// none — a background job or a unit test has no request behind it.
func RequestIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey{}).(string)
	return id
}

// NewRequestID mints an id for a request that arrived without one.
func NewRequestID() string {
	return uuid.NewString()
}

// SanitizeRequestID accepts an inbound id or replaces it with a fresh one.
//
// The value is attacker-controlled and travels straight into log lines and a
// response header, so anything with whitespace, control characters or an
// unexpected shape is discarded rather than escaped: a newline here would let
// a caller forge log entries, and a carriage return would let them split the
// response header. Only the characters that appear in the id formats anyone
// actually uses — UUIDs, trace ids, k8s request ids — are allowed through.
func SanitizeRequestID(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > maxRequestIDLen {
		return NewRequestID()
	}
	for _, r := range raw {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		case r == '-', r == '_', r == '.', r == ':':
		default:
			return NewRequestID()
		}
	}
	return raw
}
