package config

import (
	"errors"
	"fmt"
	"io/fs"
	"strings"
	"time"

	"github.com/spf13/viper"

	"github.com/lvgj-stack/stander/internal/common"
)

// DefaultInstallScriptURL is the published installer the console's one-liner
// curls when no mirror is configured. It is the same URL scripts/install.sh
// documents at its top.
const DefaultInstallScriptURL = "https://raw.githubusercontent.com/lvgj-stack/stander/main/scripts/install.sh"

var c *Config

type Config struct {
	Server      *Server
	EnableRelay bool
	Relays      []Relay
	Database    *Database
	Admin       *Admin

	// for agent
	Agent *Agent
}

type Agent struct {
	ControllerAddr string
	NodeKey        string
	IP             string
	ManagerIp      string
	IPv6           string
	Port           int32
	PreferIpv6     bool
	EnableUdp      bool
	EnableGost     bool
	ListenIp       string
}

type Database struct {
	Username string
	Password string
	DBName   string
	Addr     string
}

type Server struct {
	Port     string
	NodeRole string
	LogLevel int
	// WorkerIntervalSeconds overrides how often the background job runs.
	WorkerIntervalSeconds int
	// LogFormat is "text" or "json". JSON is what a cluster log collector can
	// parse into fields.
	LogFormat string
	// Timezone is the location the process runs in. Daily traffic rows are
	// keyed by date, so this decides when a day rolls over; a container
	// defaulting to UTC would shift the boundary by the offset.
	Timezone string
	// ControllerAddr is the host:port agents dial, as reachable from the
	// outside. The console pastes it into the install command it hands an
	// operator, so it has to be the public address rather than whatever the
	// process happens to bind: behind nginx or an ingress the browser talks to
	// :443 while agents talk to :8123, and the request's own Host header knows
	// nothing about that. Empty falls back to the console's host with Port
	// appended, which is right for a single-host deployment.
	ControllerAddr string
	// InstallScriptURL is where the install one-liner curls its script from.
	// An air-gapped or mirrored deployment points this at its own copy.
	InstallScriptURL string
}

// Admin holds settings for the admin console that used to live in naive-admin-go.
type Admin struct {
	JWTSigningKey string
}

type Relay struct {
	Name          string
	ConnectorType common.ConnectorType
	Src           string
	Chain         string
	RAddr         string
}

func (r Relay) String() string {
	return r.Name + "#" + r.Src + "#" + r.Chain + "#" + r.RAddr
}

// InitConfig loads configuration from a file, the environment, or both.
//
// Every key can be overridden by a STANDER_-prefixed environment variable
// (STANDER_DATABASE_ADDR, STANDER_ADMIN_JWTSIGNINGKEY, ...). The defaults are
// registered with viper rather than applied afterwards, because viper's
// AutomaticEnv only resolves keys it already knows about — without them an
// environment-only deployment would silently read nothing.
//
// requireFile distinguishes "the operator pointed at a config file" from "we
// fell back to the default path". A missing file is an error in the first case
// and fine in the second, which is what lets a container run on env vars alone.
func InitConfig(configPath string, requireFile bool) (*Config, error) {
	v := viper.New()
	registerDefaults(v)

	v.SetEnvPrefix("STANDER")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	if configPath != "" {
		v.SetConfigFile(configPath)
		if err := v.ReadInConfig(); err != nil {
			if requireFile || !errors.Is(err, fs.ErrNotExist) {
				return nil, fmt.Errorf("read config %s: %w", configPath, err)
			}
		}
	}

	c = &Config{}
	if err := v.Unmarshal(c); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", configPath, err)
	}
	applyDefaults(c)
	return c, nil
}

// registerDefaults declares every key so that AutomaticEnv can resolve it and
// so an operator sees sane values without writing a config file.
func registerDefaults(v *viper.Viper) {
	v.SetDefault("server.port", "8123")
	v.SetDefault("server.noderole", string(common.Controller))
	v.SetDefault("server.loglevel", 2)
	v.SetDefault("server.workerintervalseconds", 30)
	v.SetDefault("server.timezone", "Asia/Shanghai")
	v.SetDefault("server.logformat", "text")
	v.SetDefault("server.controlleraddr", "")
	v.SetDefault("server.installscripturl", "")

	v.SetDefault("enablerelay", false)

	v.SetDefault("database.username", "root")
	v.SetDefault("database.password", "")
	v.SetDefault("database.dbname", "stander")
	v.SetDefault("database.addr", "127.0.0.1:3306")

	v.SetDefault("admin.jwtsigningkey", "")
}

func applyDefaults(c *Config) {
	if c.Server == nil {
		c.Server = &Server{}
	}
	if c.Agent == nil {
		c.Agent = &Agent{}
	}
	if c.Admin == nil {
		c.Admin = &Admin{}
	}
	if c.Server.Port == "" {
		c.Server.Port = "8123"
	}
	if c.Server.NodeRole == "" {
		c.Server.NodeRole = string(common.Controller)
	}
	if c.Server.Timezone == "" {
		c.Server.Timezone = "Asia/Shanghai"
	}
	if c.Server.LogFormat == "" {
		c.Server.LogFormat = "text"
	}
	if c.Server.InstallScriptURL == "" {
		c.Server.InstallScriptURL = DefaultInstallScriptURL
	}
}

func SetConfig(cc *Config) {
	applyDefaults(cc)
	c = cc
}

func GetConfig() *Config {
	return c
}

func GetRole() string {
	return c.Server.NodeRole
}

func GetKey() string {
	return c.Agent.NodeKey
}

func GetAgentConfig() *Agent {
	return c.Agent
}

// WorkerInterval is how often the background reconciliation pass runs.
// Zero means the built-in default.
func (s *Server) WorkerInterval() time.Duration {
	if s == nil || s.WorkerIntervalSeconds <= 0 {
		return 0
	}
	return time.Duration(s.WorkerIntervalSeconds) * time.Second
}
