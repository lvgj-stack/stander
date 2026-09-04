package config

import (
	"os"
	"path/filepath"
	"testing"
)

func writeConfig(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "stander.yaml")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}
	return path
}

func TestFileValuesAreLoaded(t *testing.T) {
	path := writeConfig(t, `
Server:
  Port: "9000"
Database:
  Addr: db.internal:3306
  DBName: stander_test
Admin:
  JWTSigningKey: from-file
`)
	c, err := InitConfig(path, true)
	if err != nil {
		t.Fatalf("InitConfig: %v", err)
	}
	if c.Server.Port != "9000" {
		t.Errorf("Port = %q, want 9000", c.Server.Port)
	}
	if c.Database.Addr != "db.internal:3306" || c.Database.DBName != "stander_test" {
		t.Errorf("Database = %+v", c.Database)
	}
	if c.Admin.JWTSigningKey != "from-file" {
		t.Errorf("JWTSigningKey = %q", c.Admin.JWTSigningKey)
	}
}

// A container gets its configuration from the environment, so every key must be
// reachable that way. viper's AutomaticEnv only resolves keys it already knows,
// which is why the defaults are registered rather than applied after the fact —
// this test is what catches that regression.
func TestEnvironmentOverridesFile(t *testing.T) {
	path := writeConfig(t, `
Database:
  Addr: from-file:3306
Admin:
  JWTSigningKey: from-file
`)
	t.Setenv("STANDER_DATABASE_ADDR", "from-env:3306")
	t.Setenv("STANDER_ADMIN_JWTSIGNINGKEY", "from-env")
	t.Setenv("STANDER_SERVER_PORT", "18080")

	c, err := InitConfig(path, true)
	if err != nil {
		t.Fatalf("InitConfig: %v", err)
	}
	if c.Database.Addr != "from-env:3306" {
		t.Errorf("Database.Addr = %q, want the environment to win", c.Database.Addr)
	}
	if c.Admin.JWTSigningKey != "from-env" {
		t.Errorf("JWTSigningKey = %q, want the environment to win", c.Admin.JWTSigningKey)
	}
	if c.Server.Port != "18080" {
		t.Errorf("Port = %q, want 18080", c.Server.Port)
	}
}

// Running with no config file at all is the normal case in Kubernetes.
func TestEnvironmentOnlyWithNoFile(t *testing.T) {
	t.Setenv("STANDER_DATABASE_ADDR", "mysql:3306")
	t.Setenv("STANDER_DATABASE_DBNAME", "stander")
	t.Setenv("STANDER_ADMIN_JWTSIGNINGKEY", "secret")

	c, err := InitConfig("/does/not/exist.yaml", false)
	if err != nil {
		t.Fatalf("a missing default config file must not be fatal: %v", err)
	}
	if c.Database.Addr != "mysql:3306" {
		t.Errorf("Database.Addr = %q", c.Database.Addr)
	}
	if c.Server.Port != "8123" {
		t.Errorf("Port = %q, want the default 8123", c.Server.Port)
	}
}

// But if the operator explicitly pointed at a file, a missing one is a mistake
// worth failing on rather than silently booting with defaults.
func TestExplicitMissingFileIsAnError(t *testing.T) {
	if _, err := InitConfig("/does/not/exist.yaml", true); err == nil {
		t.Fatal("expected an error for an explicitly requested missing file")
	}
}

func TestWorkerInterval(t *testing.T) {
	tests := []struct {
		name    string
		seconds int
		wantSec float64
	}{
		{"configured", 90, 90},
		{"zero falls back to the built-in default", 0, 0},
		{"negative falls back to the built-in default", -1, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := (&Server{WorkerIntervalSeconds: tt.seconds}).WorkerInterval()
			if got.Seconds() != tt.wantSec {
				t.Errorf("got %v, want %v seconds", got, tt.wantSec)
			}
		})
	}
}

func TestNilServerWorkerInterval(t *testing.T) {
	var s *Server
	if got := s.WorkerInterval(); got != 0 {
		t.Errorf("got %v, want 0 for a nil Server", got)
	}
}
