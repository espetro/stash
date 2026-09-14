package config

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestProbeAnyResponseIsReachable(t *testing.T) {
	// Even a 5xx counts: the failure mode is null-routing, not app error.
	for _, status := range []int{200, 301, 404, 500, 503} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(status)
		}))
		m := &FailoverMonitor{PrimaryOrigin: srv.URL, MirrorOrigin: "https://mirror.example"}
		origin, err := m.Probe(context.Background())
		if err != nil || origin != OriginPrimary {
			t.Fatalf("status %d: origin=%v err=%v", status, origin, err)
		}
		srv.Close()
	}
}

func TestProbeHeadLlmsTxt(t *testing.T) {
	var gotMethod, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.WriteHeader(200)
	}))
	defer srv.Close()
	m := &FailoverMonitor{PrimaryOrigin: srv.URL, MirrorOrigin: "https://mirror.example"}
	if _, err := m.Probe(context.Background()); err != nil {
		t.Fatal(err)
	}
	if gotMethod != http.MethodHead || gotPath != ProbePath {
		t.Fatalf("probed %s %s, want HEAD /llms.txt", gotMethod, gotPath)
	}
}

func TestProbeBudget2s(t *testing.T) {
	// Server that never answers: probe must fail within the budget.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done() // hang until the client times out
	}))
	defer srv.Close()
	m := &FailoverMonitor{PrimaryOrigin: srv.URL, MirrorOrigin: "https://mirror.example"}
	start := time.Now()
	if _, err := m.Probe(context.Background()); err != nil {
		t.Fatal(err)
	}
	elapsed := time.Since(start)
	if elapsed > 3*time.Second {
		t.Fatalf("probe took %s, want <= ~2s budget", elapsed)
	}
	if m.ActiveOrigin() != OriginMirror {
		t.Fatalf("origin = %s, want mirror after unreachable probe", m.ActiveOrigin())
	}
}

func TestStartupFailureFlipsToMirror(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done() // hang: primary unreachable
	}))
	defer srv.Close()
	m := &FailoverMonitor{PrimaryOrigin: srv.URL, MirrorOrigin: "https://mirror.example"}
	if _, err := m.Probe(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := m.ActiveOrigin(); got != OriginMirror {
		t.Fatalf("origin = %s, want mirror", got)
	}
}

func TestActiveOriginTTLExpiryRetriesPrimary(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer srv.Close()
	now := time.Unix(1_000_000, 0)
	m := &FailoverMonitor{
		PrimaryOrigin: srv.URL,
		MirrorOrigin:  "https://mirror.example",
		Now:           func() time.Time { return now },
	}
	if _, err := m.Probe(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := m.ActiveOrigin(); got != OriginMirror {
		t.Fatalf("origin = %s, want mirror", got)
	}
	// Still inside TTL.
	now = now.Add(ActiveOriginTTL - time.Second)
	if got := m.ActiveOrigin(); got != OriginMirror {
		t.Fatalf("inside TTL: origin = %s, want mirror", got)
	}
	// Expiry: primary retried (reported before the next probe lands).
	now = now.Add(2 * time.Second)
	if got := m.ActiveOrigin(); got != OriginPrimary {
		t.Fatalf("after TTL: origin = %s, want primary", got)
	}
}

func TestRecoveryFlipsBackImmediately(t *testing.T) {
	down := true
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if down {
			<-r.Context().Done()
		}
		w.WriteHeader(200)
	}))
	defer srv.Close()
	m := &FailoverMonitor{PrimaryOrigin: srv.URL, MirrorOrigin: "https://mirror.example"}
	if _, err := m.Probe(context.Background()); err != nil {
		t.Fatal(err)
	}
	if m.ActiveOrigin() != OriginMirror {
		t.Fatal("expected mirror while primary down")
	}
	down = false
	if _, err := m.Probe(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := m.ActiveOrigin(); got != OriginPrimary {
		t.Fatalf("origin = %s, want primary after recovery", got)
	}
}

func TestNoMirrorEndpointDisablesFailover(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer srv.Close()
	m := &FailoverMonitor{PrimaryOrigin: srv.URL} // no MirrorOrigin
	if _, err := m.Probe(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := m.ActiveOrigin(); got != OriginPrimary {
		t.Fatalf("origin = %s, want primary when mirror unset", got)
	}
}

func TestPersistenceRoundTrip(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer srv.Close()
	var mu sync.Mutex
	var saved *FailoverState
	m := &FailoverMonitor{
		PrimaryOrigin: srv.URL,
		MirrorOrigin:  "https://mirror.example",
		Persist:       func(s FailoverState) error { mu.Lock(); st := s; saved = &st; mu.Unlock(); return nil },
	}
	if _, err := m.Probe(context.Background()); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	state := saved
	mu.Unlock()
	if state == nil || state.ActiveOrigin != OriginMirror {
		t.Fatalf("persisted = %+v", state)
	}

	// Restore: new monitor seeded from the saved state must not flap.
	restored := NewFailoverMonitor("https://down.example", "https://mirror.example", state)
	if got := restored.ActiveOrigin(); got != OriginMirror {
		t.Fatalf("restored origin = %s, want mirror", got)
	}
}

func TestProbeNeverOverlaps(t *testing.T) {
	var mu sync.Mutex
	inFlight := 0
	maxInFlight := 0
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		inFlight++
		if inFlight > maxInFlight {
			maxInFlight = inFlight
		}
		mu.Unlock()
		<-release
	}))
	defer srv.Close()
	m := &FailoverMonitor{PrimaryOrigin: srv.URL, MirrorOrigin: "https://mirror.example"}
	done := make(chan struct{})
	go func() {
		_, _ = m.Probe(context.Background())
		done <- struct{}{}
	}()
	_, _ = m.Probe(context.Background()) // second call returns cached, no overlap
	close(release)
	<-done
	mu.Lock()
	max := maxInFlight
	mu.Unlock()
	if max != 1 {
		t.Fatalf("max concurrent probes = %d, want 1", max)
	}
}

func TestFailoverStateShape(t *testing.T) {
	now := time.Unix(1_000_000, 0)
	m := &FailoverMonitor{
		PrimaryOrigin: "https://p.example",
		MirrorOrigin:  "https://m.example",
		Now:           func() time.Time { return now },
		active:        OriginMirror,
		lastProbe:     now,
		expiresAt:     now.Add(ActiveOriginTTL),
	}
	s := m.State()
	if s.ActiveOrigin != OriginMirror || !s.LastProbeAt.Equal(now) || !s.DecisionExpiresAt.Equal(now.Add(ActiveOriginTTL)) {
		t.Fatalf("state = %+v", s)
	}
}
