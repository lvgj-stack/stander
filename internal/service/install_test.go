package service

import (
	"context"
	"testing"

	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/service/req"
)

func TestControllerAddrFor(t *testing.T) {
	cases := []struct {
		name       string
		configured string
		port       string
		host       string
		want       string
	}{
		{
			name:       "a configured address wins over the request",
			configured: "agents.example.com:8123",
			port:       "8123",
			host:       "console.example.com",
			want:       "agents.example.com:8123",
		},
		{
			name: "a bare console host takes the controller port",
			port: "8123",
			host: "console.example.com",
			want: "console.example.com:8123",
		},
		{
			// nginx forwards Host without a port, but a direct hit on the Go
			// server carries the console's own port, which is not the one an
			// agent should dial.
			name: "the console's own port is replaced, not appended",
			port: "8123",
			host: "console.example.com:8080",
			want: "console.example.com:8123",
		},
		{
			name: "an IPv6 literal stays bracketed",
			port: "8123",
			host: "[2001:db8::1]:8080",
			want: "[2001:db8::1]:8123",
		},
		{
			name: "an unported IPv6 literal is still recognised",
			port: "8123",
			host: "[2001:db8::1]",
			want: "[2001:db8::1]:8123",
		},
		{
			// Nothing to guess from, so the dialog asks the operator instead of
			// handing them a command with a hole in it.
			name: "no host and no config yields no address",
			port: "8123",
			want: "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := controllerAddrFor(tc.configured, tc.port, tc.host); got != tc.want {
				t.Fatalf("controllerAddrFor(%q, %q, %q) = %q, want %q",
					tc.configured, tc.port, tc.host, got, tc.want)
			}
		})
	}
}

// useConfig installs a process-wide config for one test and puts back whatever
// was there, since config.SetConfig is global and other tests in this package
// read it through config.GetRole.
func useConfig(t *testing.T, c *config.Config) {
	t.Helper()
	previous := config.GetConfig()
	t.Cleanup(func() {
		// SetConfig fills in defaults and so cannot take a nil; leaving a
		// populated config behind is harmless for the tests that follow, which
		// either set their own or read none.
		if previous != nil {
			config.SetConfig(previous)
		}
	})
	config.SetConfig(c)
}

func TestGetAgentInstallInfoFallsBackToThePublishedInstaller(t *testing.T) {
	useConfig(t, &config.Config{Server: &config.Server{Port: "8123"}})

	got, err := GetAgentInstallInfo(context.Background(), &req.EmptyReq{}, "console.example.com")
	if err != nil {
		t.Fatalf("GetAgentInstallInfo: %v", err)
	}
	if got.ControllerAddr != "console.example.com:8123" {
		t.Errorf("ControllerAddr = %q", got.ControllerAddr)
	}
	if got.ScriptURL != config.DefaultInstallScriptURL {
		t.Errorf("ScriptURL = %q, want the published installer", got.ScriptURL)
	}
}

func TestGetAgentInstallInfoHonoursAMirror(t *testing.T) {
	useConfig(t, &config.Config{Server: &config.Server{
		Port:             "8123",
		ControllerAddr:   "10.0.0.5:8123",
		InstallScriptURL: "https://mirror.internal/install.sh",
	}})

	got, err := GetAgentInstallInfo(context.Background(), &req.EmptyReq{}, "console.example.com")
	if err != nil {
		t.Fatalf("GetAgentInstallInfo: %v", err)
	}
	if got.ControllerAddr != "10.0.0.5:8123" {
		t.Errorf("ControllerAddr = %q, want the configured address", got.ControllerAddr)
	}
	if got.ScriptURL != "https://mirror.internal/install.sh" {
		t.Errorf("ScriptURL = %q, want the mirror", got.ScriptURL)
	}
}
