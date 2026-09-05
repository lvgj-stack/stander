// Package apperr classifies the failures this service returns to a caller.
//
// Before it existed every handler answered with the same magic number — the
// literal 20001, at 48 call sites — whether the caller had sent a malformed
// body, asked for a row that does not exist, lacked permission, or hit a
// database outage. A client could not tell those apart,
// so the frontend could only ever print the message; and because the same code
// covered "you typed the wrong port" and "the database is down", nothing could
// decide what to log loudly and what to log at all.
//
// A Kind is the whole classification. Everything else — the numeric code in
// the response envelope, the machine-readable slug, the HTTP status the
// controller API answers with, and how loudly the failure is logged — is
// derived from it, so there is one place to look and one place to change.
package apperr

import (
	"errors"
	"fmt"

	"gorm.io/gorm"
)

// Kind is what went wrong, in the coarse terms a caller can act on.
type Kind int

const (
	// Internal is the default for an unclassified error: a bug, or a
	// dependency that failed. The caller can do nothing but retry or report.
	Internal Kind = iota
	// InvalidArgument means the request itself was wrong — malformed body,
	// failed validation, a value out of range.
	InvalidArgument
	// Unauthenticated means there is no usable identity behind the call.
	Unauthenticated
	// PermissionDenied means the identity is fine but may not do this.
	PermissionDenied
	// NotFound means the addressed row does not exist, or is not visible to
	// this caller — the two are deliberately indistinguishable.
	NotFound
	// Conflict means the write collides with what is already stored.
	Conflict
	// FailedPrecondition means the request is well-formed but the system is
	// not in a state that allows it — a node whose agent has not registered.
	FailedPrecondition
	// Unavailable means a dependency we call out to could not be reached.
	Unavailable
)

// Code is the number that appears as `code` in the response envelope.
//
// They are the matching HTTP status codes, which makes them readable without a
// lookup table, but they are envelope codes and not the status line: a business
// failure still answers HTTP 200 on the console API, because that is the
// contract the frontend has always read (see internal/admin/handler/base.go).
func (k Kind) Code() int {
	switch k {
	case InvalidArgument:
		return 400
	case Unauthenticated:
		return 401
	case PermissionDenied:
		return 403
	case NotFound:
		return 404
	case Conflict:
		return 409
	case FailedPrecondition:
		return 422
	case Unavailable:
		return 503
	}
	return 500
}

// Slug is the stable machine-readable name, sent as `error` in the envelope.
//
// A client that wants to branch on a failure should branch on this rather than
// on the message, which is Chinese prose meant for a person and may be reworded
// at any time.
func (k Kind) Slug() string {
	switch k {
	case InvalidArgument:
		return "invalid_argument"
	case Unauthenticated:
		return "unauthenticated"
	case PermissionDenied:
		return "permission_denied"
	case NotFound:
		return "not_found"
	case Conflict:
		return "conflict"
	case FailedPrecondition:
		return "failed_precondition"
	case Unavailable:
		return "unavailable"
	}
	return "internal"
}

// ServerFault reports whether this is our fault rather than the caller's.
//
// It decides log level: a caller mistyping a port is not worth an error line,
// while a failed database write is. Without the distinction the logs are
// either silent about real faults or full of noise from ordinary rejections.
func (k Kind) ServerFault() bool {
	return k == Internal || k == Unavailable
}

// Error is a failure with a Kind, a message meant for a person, and the cause
// it wraps.
//
// Msg is what the caller is shown. The cause is kept for the log and is never
// serialised: it is where the SQL, the driver text and the internal identifiers
// live, none of which belong in a response.
type Error struct {
	Kind  Kind
	Msg   string
	cause error
}

func (e *Error) Error() string {
	if e.cause == nil {
		return e.Msg
	}
	return e.Msg + ": " + e.cause.Error()
}

// Unwrap exposes the cause to errors.Is and errors.As.
func (e *Error) Unwrap() error { return e.cause }

// Message is the caller-facing text, without the cause appended.
func (e *Error) Message() string { return e.Msg }

// Cause is the wrapped error, for logging.
func (e *Error) Cause() error { return e.cause }

func newf(kind Kind, format string, args ...any) *Error {
	// A %w in the format is how a caller passes the cause, so unwrap it back
	// out rather than leaving it flattened into the message.
	err := fmt.Errorf(format, args...)
	return &Error{Kind: kind, Msg: err.Error(), cause: errors.Unwrap(err)}
}

// Invalidf reports a request the caller must fix.
func Invalidf(format string, args ...any) *Error { return newf(InvalidArgument, format, args...) }

// Unauthorizedf reports a missing or unusable identity.
func Unauthorizedf(format string, args ...any) *Error { return newf(Unauthenticated, format, args...) }

// Forbiddenf reports an identity that may not do this.
func Forbiddenf(format string, args ...any) *Error { return newf(PermissionDenied, format, args...) }

// NotFoundf reports a row that does not exist or is not visible.
func NotFoundf(format string, args ...any) *Error { return newf(NotFound, format, args...) }

// Conflictf reports a collision with what is already stored.
func Conflictf(format string, args ...any) *Error { return newf(Conflict, format, args...) }

// FailedPreconditionf reports a system state that does not allow the request.
func FailedPreconditionf(format string, args ...any) *Error {
	return newf(FailedPrecondition, format, args...)
}

// Internalf reports our own failure.
func Internalf(format string, args ...any) *Error { return newf(Internal, format, args...) }

// From classifies any error, so a handler never has to.
//
// An *Error passes through with its Kind intact. A gorm "record not found"
// becomes NotFound, because it is by far the most common way an ordinary
// request fails and reporting it as an internal error would bury real faults.
// Everything else is Internal: an unrecognised error is a fault until someone
// classifies it, which is the safe direction — it gets logged loudly and the
// caller is told nothing about our internals.
func From(err error) *Error {
	if err == nil {
		return nil
	}
	var app *Error
	if errors.As(err, &app) {
		return app
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &Error{Kind: NotFound, Msg: "记录不存在", cause: err}
	}
	return &Error{Kind: Internal, Msg: "服务器内部错误", cause: err}
}

// KindOf reports the classification of any error, without building an *Error.
func KindOf(err error) Kind {
	if err == nil {
		return Internal
	}
	return From(err).Kind
}
