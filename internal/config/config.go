package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"

	"github.com/lvgj-stack/stander/internal/common"
)

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

func InitConfig(configPath string) (*Config, error) {
	c = &Config{}
	viper.SetConfigFile(configPath)

	// Environment variables win over the file, so a deployment can override any
	// key without editing stander.yaml: STANDER_DATABASE_ADDR, STANDER_ADMIN_JWTSIGNINGKEY, ...
	viper.SetEnvPrefix("STANDER")
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	viper.AutomaticEnv()

	if err := viper.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("read config %s: %w", configPath, err)
	}
	if err := viper.Unmarshal(&c); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", configPath, err)
	}
	applyDefaults(c)
	return c, nil
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
