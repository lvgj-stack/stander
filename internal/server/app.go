package server

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cloudwego/hertz/pkg/common/hlog"

	"github.com/lvgj-stack/stander/api"
	"github.com/lvgj-stack/stander/internal/client"
	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/db"
	"github.com/lvgj-stack/stander/internal/forward/manager"
	"github.com/lvgj-stack/stander/internal/service/req"
	"github.com/lvgj-stack/stander/internal/service/resp"
	"github.com/lvgj-stack/stander/internal/utils"
	"github.com/lvgj-stack/stander/internal/worker"
)

// shutdownGrace is how long in-flight requests get to finish after SIGTERM.
// Keep it below the Kubernetes terminationGracePeriodSeconds in deploy/k8s.
const shutdownGrace = 15 * time.Second

// RunServer starts the controller API and the admin console in one process on
// one port. Admin routes live at the root, controller routes under /api/v1.
//
// withWorker runs the singleton background jobs in-process. That is the right
// default for a single-node install, and must be turned off when the API is
// scaled past one replica — see cmd/worker.go.
func RunServer(ctx context.Context, c *config.Config, withWorker bool) error {
	if err := applyTimezone(c.Server.Timezone); err != nil {
		return err
	}
	if err := db.Init(c.Database); err != nil {
		return err
	}
	defer func() {
		if err := db.Close(); err != nil {
			hlog.Errorf("closing database: %v", err)
		}
	}()
	utils.SetJWTSigningKey(c.Admin.JWTSigningKey)

	h := newHertz(c)
	api.RegisterHealth(h, db.Pinger{})
	api.RegisterAdmin(h)
	api.RegisterController(h)

	if withWorker {
		w := worker.New(c.Server.WorkerInterval(), c.EnableRelay)
		go func() {
			if err := w.Run(ctx); err != nil {
				hlog.Errorf("worker stopped: %v", err)
			}
		}()
	}

	return serve(ctx, h)
}

// RunWorker runs only the singleton background jobs, with no HTTP listener
// beyond the probe endpoints Kubernetes needs to tell whether it is healthy.
func RunWorker(ctx context.Context, c *config.Config) error {
	if err := applyTimezone(c.Server.Timezone); err != nil {
		return err
	}
	if err := db.Init(c.Database); err != nil {
		return err
	}
	defer func() {
		if err := db.Close(); err != nil {
			hlog.Errorf("closing database: %v", err)
		}
	}()

	h := newHertz(c)
	api.RegisterHealth(h, db.Pinger{})

	go func() {
		w := worker.New(c.Server.WorkerInterval(), c.EnableRelay)
		if err := w.Run(ctx); err != nil {
			hlog.Errorf("worker stopped: %v", err)
		}
	}()

	return serve(ctx, h)
}

// RunAgent registers this node with the controller, then serves the agent API.
func RunAgent(ctx context.Context, c *config.Config) error {
	if err := applyTimezone(c.Server.Timezone); err != nil {
		return err
	}
	r := &req.RegisterNodeReq{}
	r.Port = 8123
	r.Ipv4 = utils.GetOutBoundIPv4()
	if utils.IsPrivateIP(r.Ipv4) {
		r.Ipv4 = utils.GetOutBoundIPv4V2()
	}
	r.Ipv6 = utils.GetOutBoundIPv6()
	r.IP = r.Ipv4
	r.PreferIpv6 = c.Agent.PreferIpv6

	if c.Agent.Port != 0 {
		r.Port = c.Agent.Port
	}
	if c.Agent.IP != "" {
		r.IP = c.Agent.IP
		r.Ipv4 = c.Agent.IP
	}
	if c.Agent.IPv6 != "" {
		r.Ipv6 = c.Agent.IPv6
	}
	if r.PreferIpv6 {
		r.IP = r.Ipv6
	}

	r.ManagerIp = r.IP
	if c.Agent.ManagerIp != "" {
		r.ManagerIp = c.Agent.ManagerIp
	}

	client.Init()
	res, err := client.DoRequest(c.Agent.ControllerAddr, "node", "RegisterNode", c.Agent.NodeKey, r)
	if err != nil {
		return fmt.Errorf("register node: %w", err)
	}
	hlog.Infof("registered with controller: %s", res)

	initInfo := resp.RawResponse[resp.RegisterNodeResp]{}
	if err := json.Unmarshal([]byte(res.(string)), &initInfo); err != nil {
		return fmt.Errorf("decode register response: %w", err)
	}
	manager.InitAgent(&initInfo.Result)

	h := newHertz(c)
	api.RegisterHealth(h, nil)
	api.RegisterAgent(h)

	return serve(ctx, h)
}

// serve runs h until the process is asked to stop, then drains in-flight
// requests.
//
// Hertz's own Spin() traps signals internally, which leaves no way to cancel
// the background worker at the same moment. Handling the signal here means one
// cancellation reaches every component.
func serve(ctx context.Context, h *hertzServer) error {
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() { errCh <- h.Run() }()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	hlog.Infof("shutting down, draining for up to %s", shutdownGrace)
	drainCtx, cancel := context.WithTimeout(context.Background(), shutdownGrace)
	defer cancel()
	if err := h.Shutdown(drainCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	hlog.Info("stopped")
	return nil
}
