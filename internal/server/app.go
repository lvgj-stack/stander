package server

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/cloudwego/hertz/pkg/common/hlog"

	"github.com/lvgj-stack/stander/api"
	"github.com/lvgj-stack/stander/internal/captcha"
	"github.com/lvgj-stack/stander/internal/client"
	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/db"
	"github.com/lvgj-stack/stander/internal/forward/manager"
	"github.com/lvgj-stack/stander/internal/observability"
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
	observability.SetupLogging(observability.LogFormat(c.Server.LogFormat), c.Server.LogLevel)
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
	// Captcha answers go to the database, not a process-local map, so a login
	// can be verified by a different replica than the one that issued it.
	utils.SetCaptchaStore(captcha.New(db.Get()))

	ctx, stop := withSignals(ctx)
	defer stop()

	h := newHertz(c)
	api.RegisterHealth(h, db.Pinger{})
	api.RegisterAdmin(h)
	api.RegisterController(h)

	var wg sync.WaitGroup
	if withWorker {
		startWorker(ctx, &wg, c)
	}

	return serve(ctx, h, &wg)
}

// RunWorker runs only the singleton background jobs, with no HTTP listener
// beyond the probe endpoints Kubernetes needs to tell whether it is healthy.
func RunWorker(ctx context.Context, c *config.Config) error {
	observability.SetupLogging(observability.LogFormat(c.Server.LogFormat), c.Server.LogLevel)
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

	ctx, stop := withSignals(ctx)
	defer stop()

	h := newHertz(c)
	api.RegisterHealth(h, db.Pinger{})

	var wg sync.WaitGroup
	startWorker(ctx, &wg, c)

	return serve(ctx, h, &wg)
}

// RunAgent registers this node with the controller, then serves the agent API.
func RunAgent(ctx context.Context, c *config.Config) error {
	observability.SetupLogging(observability.LogFormat(c.Server.LogFormat), c.Server.LogLevel)
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

	ctx, stop := withSignals(ctx)
	defer stop()

	h := newHertz(c)
	api.RegisterHealth(h, nil)
	api.RegisterAgent(h)

	return serve(ctx, h, nil)
}

// withSignals returns a context cancelled on SIGINT/SIGTERM.
//
// It has to wrap the context BEFORE the background jobs are started: creating
// it inside serve() meant the workers held the uncancelled parent and never saw
// the shutdown, so they were simply killed when the process exited.
func withSignals(ctx context.Context) (context.Context, context.CancelFunc) {
	return signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
}

// startWorker runs the background jobs and registers them with wg so that
// shutdown waits for the current pass to finish instead of tearing it down
// mid-write.
func startWorker(ctx context.Context, wg *sync.WaitGroup, c *config.Config) {
	w := worker.New(c.Server.WorkerInterval(), c.EnableRelay)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := w.Run(ctx); err != nil {
			hlog.Errorf("worker stopped: %v", err)
		}
	}()
}

// serve runs h until the process is asked to stop, then drains in-flight
// requests.
//
// Hertz's own Spin() traps signals internally, which leaves no way to cancel
// the background worker at the same moment. Handling the signal here means one
// cancellation reaches every component.
func serve(ctx context.Context, h *hertzServer, workers *sync.WaitGroup) error {
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
	shutdownErr := h.Shutdown(drainCtx)

	// Wait for the background jobs to notice the cancellation, so the process
	// does not exit in the middle of a database write. Bounded by the same
	// drain window: a stuck worker must not block the pod past its grace
	// period, which would only earn it a SIGKILL.
	if workers != nil {
		if waitTimeout(workers, drainCtx) {
			hlog.Warn("background jobs did not stop within the drain window")
		}
	}

	if shutdownErr != nil {
		return fmt.Errorf("graceful shutdown: %w", shutdownErr)
	}
	hlog.Info("stopped")
	return nil
}

// waitTimeout reports whether the wait gave up before wg reached zero.
func waitTimeout(wg *sync.WaitGroup, ctx context.Context) bool {
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return false
	case <-ctx.Done():
		return true
	}
}
