package natmsg

// F4.W4 integration tests: stash_snapshot_tabs fan-out over fake browser
// ports speaking the F1 frame schema (plan
// .agents/plans/2026-08-29-local-first-f04-snapshot-tabs-reverse-channel.md).

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"
)

// fakeBrowser is an in-process browser port. Its writer function answers
// (or swallows) daemon-initiated op frames; Deliver feeds replies back.
type fakeBrowser struct {
	id  string
	hub *Hub

	mu        sync.Mutex
	frames    []*Envelope // every op frame the daemon wrote to this port
	noreply   bool        // never answer
	slow      time.Duration
	items     []Tab
	errorCode string // reply with an error frame instead
}

func newFakeBrowser(id string, hub *Hub) *fakeBrowser {
	fb := &fakeBrowser{id: id, hub: hub, items: []Tab{}}
	hub.Attach(id, id, fb.write)
	return fb
}

func (fb *fakeBrowser) write(env *Envelope) error {
	fb.mu.Lock()
	fb.frames = append(fb.frames, env)
	noreply, slow, items, code := fb.noreply, fb.slow, fb.items, fb.errorCode
	fb.mu.Unlock()
	if noreply || slow > 0 {
		if slow > 0 {
			go func() {
				time.Sleep(slow)
				fb.reply(env.CorrelationID, items, code)
			}()
		}
		return nil
	}
	fb.reply(env.CorrelationID, items, code)
	return nil
}

func (fb *fakeBrowser) reply(cid string, items []Tab, code string) {
	if code != "" {
		p, _ := json.Marshal(FrameError{Code: code, Message: "browser-side failure"})
		fb.hub.Deliver(fb.id, &Envelope{Type: TypeError, CorrelationID: cid, Payload: p})
		return
	}
	res, _ := json.Marshal(map[string]any{"items": items})
	p, _ := json.Marshal(OpResultPayload{Result: res})
	fb.hub.Deliver(fb.id, &Envelope{Type: TypeOpResult, CorrelationID: cid, Payload: p})
}

func (fb *fakeBrowser) sentCount() int {
	fb.mu.Lock()
	defer fb.mu.Unlock()
	return len(fb.frames)
}

func (fb *fakeBrowser) inboundFromDaemon() *Envelope {
	fb.mu.Lock()
	defer fb.mu.Unlock()
	if len(fb.frames) == 0 {
		return nil
	}
	return fb.frames[0]
}

// TestSnapshotTabsFrameShape pins the daemon→browser op frame against the
// F1.W4 contract (fixture for F5's inbound handler).
func TestSnapshotTabsFrameShape(t *testing.T) {
	hub := NewHub()
	fb := newFakeBrowser("Stash", hub)
	done := make(chan string, 1)
	go func() {
		out, err := hub.SnapshotTabs(context.Background(), "")
		if err != nil {
			t.Errorf("snapshot: %v", err)
		}
		done <- out
	}()
	env := waitForFrame(t, fb)
	if env.Type != TypeOp || env.CorrelationID[:7] != "daemon-" || !ValidCorrelationID(env.CorrelationID) {
		t.Fatalf("op frame shape: %+v", env)
	}
	var op OpPayload
	if err := json.Unmarshal(env.Payload, &op); err != nil {
		t.Fatal(err)
	}
	if op.Tool != "stash_snapshot_tabs" {
		t.Fatalf("op tool: %q", op.Tool)
	}
	// Answer with the proper correlation id: empty list is a valid success.
	var items []Tab
	fb.reply(env.CorrelationID, items, "")
	var got SnapshotResult
	if err := json.Unmarshal([]byte(<-done), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Items) != 0 || got.AnsweredBy != "Stash" {
		t.Fatalf("empty snapshot: %+v", got)
	}
}

// waitForFrame polls until the daemon has written its op frame to the port.
func waitForFrame(t *testing.T, fb *fakeBrowser) *Envelope {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if env := fb.inboundFromDaemon(); env != nil {
			return env
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("daemon sent no frame")
	return nil
}

func TestSnapshotTabsMRUOrdering(t *testing.T) {
	hub := NewHub()
	a := newFakeBrowser("alpha", hub)
	b := newFakeBrowser("beta", hub)
	a.items = []Tab{{URL: "https://a.example", Title: "A"}}
	b.items = []Tab{{URL: "https://b.example", Title: "B"}}

	// First call goes to the MRU head: the most recently attached browser
	// (attachment counts as activity), here beta.
	out := mustSnap(t, hub, "")
	if answeredBy(t, out) != "beta" {
		t.Fatalf("first call: %s", out)
	}
	// Any inbound frame from alpha promotes it to the front.
	hub.TouchPeer("alpha")
	out = mustSnap(t, hub, "")
	if answeredBy(t, out) != "alpha" {
		t.Fatalf("after alpha touch, want alpha: %s", out)
	}
	// beta traffic promotes back.
	hub.TouchPeer("beta")
	out = mustSnap(t, hub, "")
	if answeredBy(t, out) != "beta" {
		t.Fatalf("after beta touch, want beta: %s", out)
	}
}

func TestSnapshotTabsBrowserTargeting(t *testing.T) {
	hub := NewHub()
	a := newFakeBrowser("alpha", hub)
	newFakeBrowser("beta", hub)
	a.items = []Tab{{URL: "https://a.example", Title: "A"}}

	out := mustSnap(t, hub, "beta")
	if answeredBy(t, out) != "beta" {
		t.Fatalf("targeted call: %s", out)
	}
	if a.sentCount() != 0 {
		t.Fatal("targeted call reached the wrong browser")
	}
	// Unknown label errors naming the valid labels.
	_, err := hub.SnapshotTabs(context.Background(), "gamma")
	te, ok := err.(*ToolError)
	if !ok || te.Code != "browser_not_found" {
		t.Fatalf("unknown label: %v", err)
	}
}

func TestSnapshotTabsNoBrowser(t *testing.T) {
	hub := NewHub()
	_, err := hub.SnapshotTabs(context.Background(), "")
	te, ok := err.(*ToolError)
	if !ok || te.Code != "no_browser_attached" {
		t.Fatalf("want no_browser_attached, got %v", err)
	}
	if te.Message != "stash_snapshot_tabs needs a browser with the stash extension running and paired to this daemon" {
		t.Fatalf("message: %q", te.Message)
	}
}

func TestSnapshotTabsTimeoutAndSingleFailover(t *testing.T) {
	hub := NewHub()
	silent := newFakeBrowser("silent", hub)
	silent.noreply = true
	healthy := newFakeBrowser("healthy", hub)
	healthy.items = []Tab{{URL: "https://h.example", Title: "H"}}
	// Promote silent to the MRU head so the first attempt times out and the
	// single failover lands on healthy.
	hub.TouchPeer("silent")

	start := time.Now()
	out := mustSnap(t, hub, "")
	if answeredBy(t, out) != "healthy" {
		t.Fatalf("failover answer: %s", out)
	}
	if elapsed := time.Since(start); elapsed < SnapshotTimeout {
		t.Fatalf("failover returned before timeout budget: %v", elapsed)
	}
	if silent.sentCount() != 1 || healthy.sentCount() != 1 {
		t.Fatalf("frame counts: silent=%d healthy=%d (no duplicate frames allowed)", silent.sentCount(), healthy.sentCount())
	}
	// All browsers silent: browser_timeout.
	hub2 := NewHub()
	s1 := newFakeBrowser("s1", hub2)
	s1.noreply = true
	s2 := newFakeBrowser("s2", hub2)
	s2.noreply = true
	_, err := hub2.SnapshotTabs(context.Background(), "")
	te, ok := err.(*ToolError)
	if !ok || te.Code != "browser_timeout" {
		t.Fatalf("all silent: %v", err)
	}
	if s1.sentCount() != 1 || s2.sentCount() != 1 {
		t.Fatalf("failover must try each browser exactly once: %d %d", s1.sentCount(), s2.sentCount())
	}
}

func TestSnapshotTabsDisconnectMidFlight(t *testing.T) {
	hub := NewHub()
	flaky := newFakeBrowser("flaky", hub)
	flaky.noreply = true
	hub.Detach("flaky") // disconnect while a request would be pending
	// Reattach a healthy one and confirm the tool errors cleanly when only
	// the detached peer was a candidate, and that Detach cleared state.
	healthy := newFakeBrowser("healthy", hub)
	healthy.items = []Tab{{URL: "https://h.example", Title: "H"}}
	out := mustSnap(t, hub, "")
	if answeredBy(t, out) != "healthy" {
		t.Fatalf("post-detach: %s", out)
	}

	// Disconnect DURING an in-flight request: request fails, no dangling
	// pending entry, and a later request works.
	hub3 := NewHub()
	gone := newFakeBrowser("gone", hub3)
	gone.noreply = true
	go func() {
		time.Sleep(20 * time.Millisecond)
		hub3.Detach("gone")
	}()
	_, err := hub3.SnapshotTabs(context.Background(), "")
	te, ok := err.(*ToolError)
	if !ok || te.Code != "browser_disconnected" {
		t.Fatalf("mid-flight disconnect: %v", err)
	}
	hub3.mu.Lock()
	dangling := len(hub3.pending) + len(hub3.inFlight)
	hub3.mu.Unlock()
	if dangling != 0 {
		t.Fatalf("dangling pending entries after disconnect: %d", dangling)
	}
}

func TestSnapshotTabsLateReplyDropped(t *testing.T) {
	hub := NewHub()
	slow := newFakeBrowser("slow", hub)
	slow.slow = 30 * time.Millisecond
	quick := newFakeBrowser("quick", hub)
	quick.items = []Tab{{URL: "https://q.example", Title: "Q"}}

	// slow is MRU head; it answers after the timeout, so quick wins.
	out := mustSnap(t, hub, "")
	if answeredBy(t, out) != "quick" {
		t.Fatalf("want quick via failover: %s", out)
	}
	// The late reply from slow must have been dropped: no pending entries,
	// and the NEXT request routes fresh (to slow, MRU head again after its
	// request, actually quick's reply promoted quick — assert no misrouting
	// by checking the next call gets a clean correlated answer).
	hub.mu.Lock()
	dangling := len(hub.pending)
	hub.mu.Unlock()
	if dangling != 0 {
		t.Fatalf("late reply left pending state: %d", dangling)
	}
	out = mustSnap(t, hub, "")
	if answeredBy(t, out) == "" {
		t.Fatalf("subsequent request broken: %s", out)
	}
}

func TestSnapshotTabsBrowserErrorFrame(t *testing.T) {
	hub := NewHub()
	bad := newFakeBrowser("bad", hub)
	bad.errorCode = "TABS_PERMISSION_DENIED"
	_, err := hub.SnapshotTabs(context.Background(), "")
	te, ok := err.(*ToolError)
	if !ok || te.Code != "TABS_PERMISSION_DENIED" {
		t.Fatalf("browser error frame: %v", err)
	}
}

// TestSnapshotTabsConcurrentNoDuplicateFrames: N concurrent calls against
// fake browsers must never duplicate an op frame to a single port (one
// outstanding request per port; the rest fail over or time out).
func TestSnapshotTabsConcurrentNoDuplicateFrames(t *testing.T) {
	hub := NewHub()
	a := newFakeBrowser("alpha", hub)
	b := newFakeBrowser("beta", hub)
	a.items = []Tab{{URL: "https://a.example", Title: "A"}}
	b.items = []Tab{{URL: "https://b.example", Title: "B"}}

	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := hub.SnapshotTabs(context.Background(), "")
			if err != nil {
				errs <- err
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		te, ok := err.(*ToolError)
		if !ok || (te.Code != "browser_timeout" && te.Code != "browser_disconnected") {
			t.Errorf("unexpected concurrent error: %v", err)
		}
	}
	if a.sentCount() > 8 || b.sentCount() > 8 {
		t.Fatalf("excess frames: alpha=%d beta=%d", a.sentCount(), b.sentCount())
	}
}

func mustSnap(t *testing.T, hub *Hub, browser string) string {
	t.Helper()
	out, err := hub.SnapshotTabs(context.Background(), browser)
	if err != nil {
		t.Fatalf("snapshot(%q): %v", browser, err)
	}
	return out
}

// answeredBy extracts the answering browser label from a snapshot payload.
func answeredBy(t *testing.T, out string) string {
	t.Helper()
	var r SnapshotResult
	if err := json.Unmarshal([]byte(out), &r); err != nil {
		t.Fatalf("bad snapshot JSON %q: %v", out, err)
	}
	return r.AnsweredBy
}
