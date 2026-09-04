package observability

import (
	"os"

	"github.com/cloudwego/hertz/pkg/common/hlog"
	hertzzap "github.com/hertz-contrib/logger/zap"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// LogFormat selects how log lines are rendered.
type LogFormat string

const (
	// LogFormatText is the human-readable console format, for local runs.
	LogFormatText LogFormat = "text"
	// LogFormatJSON emits one JSON object per line, which is what a cluster's
	// log collector can actually parse into fields.
	LogFormatJSON LogFormat = "json"
)

// SetupLogging installs the process logger. An unrecognised format falls back
// to text rather than failing to boot, since a logging preference is never
// worth refusing to start over.
func SetupLogging(format LogFormat, level int) {
	encoderCfg := zap.NewProductionEncoderConfig()
	encoderCfg.TimeKey = "ts"
	encoderCfg.EncodeTime = zapcore.ISO8601TimeEncoder

	var encoder zapcore.Encoder
	if format == LogFormatJSON {
		encoder = zapcore.NewJSONEncoder(encoderCfg)
	} else {
		encoderCfg.EncodeLevel = zapcore.CapitalColorLevelEncoder
		encoder = zapcore.NewConsoleEncoder(encoderCfg)
	}

	logger := hertzzap.NewLogger(hertzzap.WithZapOptions(zap.AddCaller()),
		hertzzap.WithCoreEnc(encoder),
		hertzzap.WithCoreWs(zapcore.AddSync(os.Stdout)),
		hertzzap.WithCoreLevel(zap.NewAtomicLevelAt(zapLevel(level))),
	)
	hlog.SetLogger(logger)
	hlog.SetLevel(hlog.Level(level))
}

// zapLevel maps hlog's numeric levels onto zap's.
func zapLevel(level int) zapcore.Level {
	switch hlog.Level(level) {
	case hlog.LevelTrace, hlog.LevelDebug:
		return zapcore.DebugLevel
	case hlog.LevelInfo, hlog.LevelNotice:
		return zapcore.InfoLevel
	case hlog.LevelWarn:
		return zapcore.WarnLevel
	case hlog.LevelError:
		return zapcore.ErrorLevel
	case hlog.LevelFatal:
		return zapcore.FatalLevel
	}
	return zapcore.InfoLevel
}
