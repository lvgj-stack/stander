package service

import (
	"context"
	"net"
	"strings"

	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/service/req"
	"github.com/lvgj-stack/stander/internal/service/resp"
)

// GetAgentInstallInfo tells the console what a node's install command needs
// besides the node key: where the agent should dial back to, and which
// installer to curl.
//
// consoleHost is the Host the console request arrived with. It is a parameter
// rather than a bindable field for the same reason RegisterNode's peer address
// is: a caller-supplied value here would end up pasted into a command an
// operator runs as root on a fresh box.
//
// The command itself is assembled in the browser, not here, because the
// address is editable in the dialog — a deployment whose agents reach the
// controller by a different name than the console does can correct it without
// the answer having to round-trip.
func GetAgentInstallInfo(ctx context.Context, _ *req.EmptyReq, consoleHost string) (*resp.AgentInstallInfoResp, error) {
	cfg := config.GetConfig()
	var srv *config.Server
	if cfg != nil {
		srv = cfg.Server
	}

	addr, port, scriptURL := "", "", config.DefaultInstallScriptURL
	if srv != nil {
		addr, port = srv.ControllerAddr, srv.Port
		if srv.InstallScriptURL != "" {
			scriptURL = srv.InstallScriptURL
		}
	}

	return &resp.AgentInstallInfoResp{
		ControllerAddr: controllerAddrFor(addr, port, consoleHost),
		ScriptURL:      scriptURL,
	}, nil
}

// controllerAddrFor picks the address to suggest for `stander agent -a`.
//
// A configured address always wins — it is the only input that knows how the
// deployment is fronted. Otherwise the console's own host is reused with the
// controller port swapped in, which is correct whenever the console and the
// controller are the same process on the same host, and a starting point the
// operator can edit when they are not.
func controllerAddrFor(configured, port, consoleHost string) string {
	if configured != "" {
		return configured
	}

	host := strings.TrimSpace(consoleHost)
	if host == "" {
		return ""
	}
	// A Host header may or may not carry a port, and an IPv6 literal is
	// bracketed either way; SplitHostPort only succeeds for the ported form.
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	if host == "" {
		return ""
	}
	if port == "" {
		return host
	}
	return net.JoinHostPort(host, port)
}
