// Package observability holds the Prometheus metrics stander exports and the
// logging setup that makes its output collectable.
package observability

import (
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// RequestsTotal counts finished HTTP requests.
	//
	// The path label is the registered route pattern ("/user/:id"), never the
	// raw URL: labelling by raw path would mint a new time series per user id
	// and blow up cardinality.
	RequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "stander_http_requests_total",
		Help: "Total HTTP requests processed, by route, method and status.",
	}, []string{"path", "method", "status"})

	RequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "stander_http_request_duration_seconds",
		Help:    "HTTP request latency by route and method.",
		Buckets: prometheus.DefBuckets,
	}, []string{"path", "method"})

	// WorkerRunsTotal counts background reconciliation passes. A worker that
	// stops making passes is the failure this is here to catch.
	WorkerRunsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "stander_worker_runs_total",
		Help: "Background reconciliation passes, by outcome.",
	}, []string{"outcome"})

	WorkerDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "stander_worker_run_duration_seconds",
		Help:    "Duration of a background reconciliation pass.",
		Buckets: []float64{.1, .5, 1, 2.5, 5, 10, 30, 60},
	})
)

// ObserveRequest records one finished HTTP request.
func ObserveRequest(path, method string, status int, d time.Duration) {
	RequestsTotal.WithLabelValues(path, method, strconv.Itoa(status)).Inc()
	RequestDuration.WithLabelValues(path, method).Observe(d.Seconds())
}

// ObserveWorkerRun records one finished background pass.
func ObserveWorkerRun(err error, d time.Duration) {
	outcome := "success"
	if err != nil {
		outcome = "error"
	}
	WorkerRunsTotal.WithLabelValues(outcome).Inc()
	WorkerDuration.Observe(d.Seconds())
}
