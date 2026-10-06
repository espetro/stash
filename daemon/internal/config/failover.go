package config

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// Failover constants (F13 W3, spec §9a.4).
const (
	// ProbeBudget is the overall budget for one primary probe. The failure
	// mode is IP null-routing (connect hangs), so the budget is the test.
	ProbeBudget = 2 * time.Second
	// ProbeInterval is the scheduled cadence; never per request.
	ProbeInterval = 10 * time.Minute
	// ActiveOriginTTL is how long a "mirror" decision is trusted before
	// the primary is retried by the next scheduled probe.
	ActiveOriginTTL = 15 * time.Minute
	// ProbePath is small, cacheable, and always present on both origins.
	ProbePath = "/llms.txt"
)

// ActiveOrigin is the failover flag owned by F13 (cross-issue contract).
// Share-link emitters read it to decide which origin a new link points at.
type ActiveOrigin string

const (
	OriginPrimary ActiveOrigin = "primary"
	OriginMirror  ActiveOrigin = "mirror"
)

// FailoverState is the persisted record: flag plus timestamps for
// diagnostics. The daemon keeps it in its state store so a restart
// mid-outage does not flap back to primary.
type FailoverState struct {
	ActiveOrigin      ActiveOrigin `json:"activeOrigin"`
	LastProbeAt       time.Time    `json:"lastProbeAt"`
	DecisionExpiresAt time.Time    `json:"decisionExpiresAt"`
}

// FailoverMonitor probes the primary and selects the active origin.
// It is safe for concurrent use; probing never blocks share-link
// generation (ActiveOrigin reports from cached state).
type FailoverMonitor struct {
	// PrimaryOrigin is the default share origin (relay endpoint).
	PrimaryOrigin string
	// MirrorOrigin is the configured mirror endpoint; empty disables
	// failover and ActiveOrigin stays primary.
	MirrorOrigin string

	// ProbeURL overrides the probed URL (tests). Empty means
	// PrimaryOrigin + ProbePath.
	ProbeURL string
	// Now overrides the clock (tests).
	Now func() time.Time
	// HTTPClient overrides the client (tests).
	HTTPClient *http.Client
	// Persist, when set, is called after each completed probe.
	Persist func(FailoverState) error

	mu          sync.Mutex
	active      ActiveOrigin
	lastProbe   time.Time
	expiresAt   time.Time
	probing     bool
	stopCh      chan struct{}
	stopOnce    sync.Once
	restoreOnce sync.Once
	restored    bool
}

// NewFailoverMonitor builds a monitor. state, when non-nil, seeds the
// cached decision (restart mid-outage persistence).
func NewFailoverMonitor(primary, mirror string, state *FailoverState) *FailoverMonitor {
	m := &FailoverMonitor{
		PrimaryOrigin: primary,
		MirrorOrigin:  mirror,
		active:        OriginPrimary,
		stopCh:        make(chan struct{}),
	}
	if state != nil && state.ActiveOrigin == OriginMirror {
		m.active = OriginMirror
		m.lastProbe = state.LastProbeAt
		m.expiresAt = state.DecisionExpiresAt
		m.restored = true
	}
	return m
}

func (m *FailoverMonitor) now() time.Time {
	if m.Now != nil {
		return m.Now()
	}
	return time.Now()
}

func (m *FailoverMonitor) client() *http.Client {
	if m.HTTPClient != nil {
		return m.HTTPClient
	}
	return http.DefaultClient
}

// Probe runs one probe round and updates the decision. Any HTTP response
// counts as reachable (even 5xx): the failure mode is null-routing, not
// application error. Connect/TLS/timeout failures flip to mirror.
func (m *FailoverMonitor) Probe(ctx context.Context) (ActiveOrigin, error) {
	m.mu.Lock()
	if m.probing {
		defer m.mu.Unlock()
		return m.active, nil // never overlap probes
	}
	m.probing = true
	m.mu.Unlock()
	defer func() {
		m.mu.Lock()
		m.probing = false
		m.mu.Unlock()
	}()

	if m.MirrorOrigin == "" {
		// Failover disabled.
		m.mu.Lock()
		m.active = OriginPrimary
		m.mu.Unlock()
		return OriginPrimary, nil
	}

	probeURL := m.ProbeURL
	if probeURL == "" {
		probeURL = m.PrimaryOrigin + ProbePath
	}
	reachable, err := m.headOK(ctx, probeURL)

	m.mu.Lock()
	now := m.now()
	m.lastProbe = now
	previous := m.active
	if err == nil && reachable {
		m.active = OriginPrimary
		m.expiresAt = time.Time{}
	} else {
		m.active = OriginMirror
		m.expiresAt = now.Add(ActiveOriginTTL)
	}
	state := m.stateLocked()
	m.mu.Unlock()

	if m.Persist != nil {
		if err := m.Persist(state); err != nil {
			return m.ActiveOrigin(), fmt.Errorf("persist failover state: %w", err)
		}
	}
	_ = previous
	return state.ActiveOrigin, nil
}

// headOK reports whether the probe URL answered within the budget.
func (m *FailoverMonitor) headOK(ctx context.Context, url string) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, ProbeBudget)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, url, nil)
	if err != nil {
		return false, fmt.Errorf("build probe request: %w", err)
	}
	resp, err := m.client().Do(req)
	if err != nil {
		return false, nil // unreachable: connect, TLS, or budget exceeded
	}
	defer resp.Body.Close()
	return true, nil // any status: the network path works
}

// ActiveOrigin returns the current decision, reading only cached state —
// never blocking on a probe. An expired mirror decision reports primary
// (it will be retried by the next scheduled probe).
func (m *FailoverMonitor) ActiveOrigin() ActiveOrigin {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.MirrorOrigin == "" {
		return OriginPrimary
	}
	if m.active == OriginMirror && !m.expiresAt.IsZero() && m.now().After(m.expiresAt) {
		return OriginPrimary
	}
	return m.active
}

// State snapshots the decision for diagnostics and persistence.
func (m *FailoverMonitor) State() FailoverState {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.stateLocked()
}

func (m *FailoverMonitor) stateLocked() FailoverState {
	return FailoverState{
		ActiveOrigin:      m.active,
		LastProbeAt:       m.lastProbe,
		DecisionExpiresAt: m.expiresAt,
	}
}

// Start runs an immediate probe, then probes every ProbeInterval until
// Stop. Intended to be launched in a goroutine at daemon startup.
func (m *FailoverMonitor) Start(ctx context.Context) {
	if _, err := m.Probe(ctx); err != nil {
		// Probe errors are decision-relevant only via Persist; a failed
		// persist must not kill the loop.
		_ = err
	}
	t := time.NewTicker(ProbeInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-m.stopCh:
			return
		case <-t.C:
			_, _ = m.Probe(ctx)
		}
	}
}

// Stop terminates the scheduled loop; safe to call multiple times.
func (m *FailoverMonitor) Stop() {
	m.stopOnce.Do(func() { close(m.stopCh) })
}
