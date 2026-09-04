// Package worker runs stander's singleton background jobs.
//
// Exactly one worker may run against a database at a time: it advances every
// user's traffic period and, when relaying is enabled, drives the forwarding
// manager. The HTTP API is stateless and can be scaled to any number of
// replicas; the worker cannot. Deploy it as its own single-replica workload.
package worker

import (
	"context"
	"time"

	"github.com/cloudwego/hertz/pkg/common/hlog"

	"github.com/lvgj-stack/stander/internal/captcha"
	"github.com/lvgj-stack/stander/internal/db"
	"github.com/lvgj-stack/stander/internal/forward/manager"
	"github.com/lvgj-stack/stander/internal/observability"
)

// DefaultInterval is how often the traffic reconciliation pass runs.
const DefaultInterval = 30 * time.Second

type Worker struct {
	Interval    time.Duration
	EnableRelay bool
}

func New(interval time.Duration, enableRelay bool) *Worker {
	if interval <= 0 {
		interval = DefaultInterval
	}
	return &Worker{Interval: interval, EnableRelay: enableRelay}
}

// Run blocks until ctx is cancelled.
//
// A failed pass is logged and the next one still runs: a transient database
// error should not permanently stop traffic accounting, which is what happened
// before when the first error terminated the loop.
func (w *Worker) Run(ctx context.Context) error {
	if w.EnableRelay {
		mgr, err := manager.Init()
		if err != nil {
			return err
		}
		defer mgr.Shutdown()
	}

	ticker := time.NewTicker(w.Interval)
	defer ticker.Stop()

	hlog.Infof("worker started, interval=%s relay=%v", w.Interval, w.EnableRelay)
	for {
		select {
		case <-ctx.Done():
			hlog.Info("worker stopping")
			return nil
		case <-ticker.C:
			start := time.Now()
			err := ReconcileTrafficPlans(ctx)
			observability.ObserveWorkerRun(err, time.Since(start))
			if err != nil {
				hlog.Errorf("traffic reconciliation failed: %v", err)
			}
			// Without this the captcha table grows by one row per issued
			// captcha and is never pruned.
			if n, err := captcha.DeleteExpired(db.Get()); err != nil {
				hlog.Errorf("pruning expired captchas failed: %v", err)
			} else if n > 0 {
				hlog.Debugf("pruned %d expired captchas", n)
			}
		}
	}
}
