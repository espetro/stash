// Reverse-channel request machinery (F4.W1, plan
// .agents/plans/2026-08-29-local-first-f04-snapshot-tabs-reverse-channel.md).
//
// The daemon initiates a request frame to an attached browser (type "op",
// correlationId minted with the daemon origin per the F1.W4 convention),
// and awaits the correlated reply ("opResult", or an "error" frame). The
// Hub multiplexes this over every attached browser host connection and owns
// the fan-out semantics for stash_snapshot_tabs:
//
//   - attached-browser registry with MRU ordering, promoted on ANY inbound
//     frame from a port (extends F2's registry);
//   - untargeted calls go to the MRU head with a 5s timeout, then fail over
//     to the next browser exactly once, then fail;
//   - a `browser` label argument targets exactly one port;
//   - zero attached browsers is the distinct no_browser_attached tool
//     error, never an empty item list;
//   - one outstanding request per port (MVP); late replies after timeout
//     find no pending entry and are dropped, never misrouted.
//
// The wire shapes below are testable contract fixtures for F5 (extension
// side, see snapshot_tabs fixtures under testdata/ and
// frames_conformance_test.go).
package natmsg

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"
)

// ToolSnapshotTabs is the frozen tool name served over the reverse channel.
const ToolSnapshotTabs = "stash_snapshot_tabs"

// SnapshotTimeout is the per-browser reply budget (spec §4.4).
const SnapshotTimeout = 5 * time.Second

// Frame types for reverse-channel requests (F1.W4 envelope, both
// directions). op is a tool invocation; opResult is the correlated success
// reply.
const (
	TypeOp       = "op"
	TypeOpResult = "opResult"
)

// OpPayload: tool invocation; the tool name passes through opaquely.
type OpPayload struct {
	Tool string          `json:"tool"`
	Args json.RawMessage `json:"args,omitempty"`
}

// OpResultPayload: correlated success reply.
type OpResultPayload struct {
	Result json.RawMessage `json:"result"`
}

// Tab is one browser tab in a snapshot.
type Tab struct {
	URL   string `json:"url"`
	Title string `json:"title"`
}

// SnapshotResult is the harness-facing response shape: items plus which
// browser answered. The daemon attaches answeredBy (it knows the port);
// the extension may omit it.
type SnapshotResult struct {
	Items      []Tab  `json:"items"`
	AnsweredBy string `json:"answeredBy"`
}

// ToolError is a defined tool-level error surfaced to the harness as the
// CallError code/message pair. Codes: no_browser_attached, browser_not_found,
// browser_timeout, browser_disconnected, browser_error.
type ToolError struct {
	Code    string
	Message string
}

func (e *ToolError) Error() string     { return e.Message }
func (e *ToolError) ErrorCode() string { return e.Code }

// Sentinel errors distinguishing timeout from disconnect mid-flight.
var (
	errTimeout      = errors.New("timeout")
	errDisconnected = errors.New("disconnected")
	errNotAttached  = errors.New("not attached")
	errAlreadyInFlt = errors.New("request already in flight for this browser")
)

// hubConn is one attached browser host connection.
type hubConn struct {
	peerID string
	label  string
	write  func(*Envelope) error // goroutine-safe, owned by the host loop
	done   chan struct{}         // closed by Detach
}

// Hub multiplexes reverse-channel requests across attached browsers and owns
// the MRU registry (shared with the host loops via Registry()).
type Hub struct {
	reg *Registry

	mu       sync.Mutex
	conns    map[string]*hubConn
	pending  map[string]chan hubReply // correlationID -> reply slot
	inFlight map[string]string        // peerID -> outstanding correlationID
}

type hubReply struct {
	env *Envelope
	err error
}

// NewHub creates an empty hub with its own registry.
func NewHub() *Hub {
	return &Hub{
		reg:      NewRegistry(),
		conns:    map[string]*hubConn{},
		pending:  map[string]chan hubReply{},
		inFlight: map[string]string{},
	}
}

// Registry exposes the shared MRU registry (status, host loops).
func (h *Hub) Registry() *Registry { return h.reg }

// Attach registers a browser host connection. write must be goroutine-safe.
func (h *Hub) Attach(peerID, label string, write func(*Envelope) error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if old, ok := h.conns[peerID]; ok {
		close(old.done)
	}
	h.conns[peerID] = &hubConn{peerID: peerID, label: label, write: write, done: make(chan struct{})}
	h.reg.Touch(peerID, label)
}

// Detach removes a browser host connection and fails its in-flight request.
func (h *Hub) Detach(peerID string) {
	h.mu.Lock()
	conn, ok := h.conns[peerID]
	if ok {
		delete(h.conns, peerID)
	}
	h.reg.Remove(peerID)
	var ch chan hubReply
	if cid, inflight := h.inFlight[peerID]; inflight {
		delete(h.inFlight, peerID)
		if slot, ok := h.pending[cid]; ok {
			delete(h.pending, cid)
			ch = slot
		}
	}
	h.mu.Unlock()
	if ok {
		close(conn.done)
	}
	if ch != nil {
		ch <- hubReply{err: errDisconnected}
	}
}

// TouchPeer promotes a peer to the MRU front on any inbound frame.
func (h *Hub) TouchPeer(peerID string) {
	h.mu.Lock()
	label := ""
	if c, ok := h.conns[peerID]; ok {
		label = c.label
	}
	h.mu.Unlock()
	h.reg.Touch(peerID, label)
}

// Deliver routes an inbound frame from a browser: promotes MRU, and if it
// answers an outstanding request, hands it to the waiter. Late replies
// (request already timed out) find no pending slot and are dropped.
func (h *Hub) Deliver(peerID string, env *Envelope) {
	h.TouchPeer(peerID)
	if env.Type != TypeOpResult && env.Type != TypeError {
		return
	}
	h.mu.Lock()
	slot, ok := h.pending[env.CorrelationID]
	if ok {
		delete(h.pending, env.CorrelationID)
		for pid, cid := range h.inFlight {
			if cid == env.CorrelationID {
				delete(h.inFlight, pid)
			}
		}
	}
	h.mu.Unlock()
	if ok {
		slot <- hubReply{env: env}
	}
}

// request sends one op frame to peerID and awaits the correlated reply with
// the given budget. Guarantees exactly one frame on the wire per call and
// no dangling pending entries on any exit path.
func (h *Hub) request(ctx context.Context, peerID string, timeout time.Duration) (*Envelope, error) {
	cid, err := MintCorrelationID("daemon")
	if err != nil {
		return nil, err
	}
	args, _ := json.Marshal(map[string]any{})
	payload, err := json.Marshal(OpPayload{Tool: ToolSnapshotTabs, Args: args})
	if err != nil {
		return nil, err
	}
	env := &Envelope{Type: TypeOp, CorrelationID: cid, Payload: payload}

	h.mu.Lock()
	conn, ok := h.conns[peerID]
	if !ok {
		h.mu.Unlock()
		return nil, errNotAttached
	}
	if _, busy := h.inFlight[peerID]; busy {
		h.mu.Unlock()
		return nil, errAlreadyInFlt
	}
	slot := make(chan hubReply, 1)
	h.pending[cid] = slot
	h.inFlight[peerID] = cid
	h.mu.Unlock()

	// Write outside the hub lock: a synchronous reply path (Deliver) takes
	// the same lock and would deadlock.
	if writeErr := conn.write(env); writeErr != nil {
		h.dropPending(peerID, cid)
		return nil, writeErr
	}

	select {
	case r := <-slot:
		return r.env, r.err
	case <-conn.done:
		h.dropPending(peerID, cid)
		return nil, errDisconnected
	case <-time.After(timeout):
		h.dropPending(peerID, cid)
		return nil, errTimeout
	case <-ctx.Done():
		h.dropPending(peerID, cid)
		return nil, ctx.Err()
	}
}

func (h *Hub) dropPending(peerID, cid string) {
	h.mu.Lock()
	delete(h.pending, cid)
	delete(h.inFlight, peerID)
	h.mu.Unlock()
}

// SnapshotTabs implements the stash_snapshot_tabs fan-out (plan W1): no
// browser argument targets the MRU head with a single 5s failover; a browser
// label targets exactly that port. The returned JSON is the harness-facing
// SnapshotResult.
func (h *Hub) SnapshotTabs(ctx context.Context, browser string) (string, error) {
	peers := h.reg.Peers()
	if len(peers) == 0 {
		return "", &ToolError{Code: "no_browser_attached",
			Message: "stash_snapshot_tabs needs a browser with the stash extension running and paired to this daemon"}
	}

	var candidates []Peer
	attempts := 2 // MRU head, then one failover
	if browser != "" {
		attempts = 1
		for _, p := range peers {
			if p.Label == browser {
				candidates = []Peer{p}
				break
			}
		}
		if candidates == nil {
			labels := make([]string, 0, len(peers))
			for _, p := range peers {
				labels = append(labels, p.Label)
			}
			return "", &ToolError{Code: "browser_not_found",
				Message: fmt.Sprintf("no paired browser labeled %q; paired browsers: %v", browser, labels)}
		}
	} else {
		candidates = peers
	}

	var lastErr error
	tried := 0
	for _, p := range candidates {
		if tried >= attempts {
			break
		}
		tried++
		env, err := h.request(ctx, p.ID, SnapshotTimeout)
		if err != nil {
			if errors.Is(err, errAlreadyInFlt) {
				err = errTimeout
			}
			lastErr = err
			continue
		}
		return h.snapshotResult(p.Label, env)
	}

	switch {
	case lastErr == nil:
		return "", &ToolError{Code: "browser_timeout", Message: "no browser available for stash_snapshot_tabs"}
	case errors.Is(lastErr, errTimeout):
		return "", &ToolError{Code: "browser_timeout",
			Message: fmt.Sprintf("no browser answered stash_snapshot_tabs within %s (tried %d browser(s))", SnapshotTimeout, tried)}
	case errors.Is(lastErr, errDisconnected):
		return "", &ToolError{Code: "browser_disconnected",
			Message: "the browser disconnected while answering stash_snapshot_tabs"}
	default:
		return "", &ToolError{Code: "browser_error", Message: lastErr.Error()}
	}
}

// snapshotResult decodes an opResult (or error frame) reply and attaches
// answeredBy. An extension reply omitting items decodes as an empty list
// (a valid answer), never an error.
func (h *Hub) snapshotResult(label string, env *Envelope) (string, error) {
	if env.Type == TypeError {
		var fe FrameError
		_ = json.Unmarshal(env.Payload, &fe)
		code := fe.Code
		if code == "" {
			code = "browser_error"
		}
		msg := fe.Message
		if msg == "" {
			msg = "browser reported an error answering stash_snapshot_tabs"
		}
		return "", &ToolError{Code: code, Message: msg}
	}
	var or OpResultPayload
	if err := json.Unmarshal(env.Payload, &or); err != nil {
		return "", &ToolError{Code: "browser_error", Message: "malformed opResult payload: " + err.Error()}
	}
	var res struct {
		Items   []Tab  `json:"items"`
		Warning string `json:"warning"`
	}
	if len(or.Result) > 0 {
		if err := json.Unmarshal(or.Result, &res); err != nil {
			return "", &ToolError{Code: "browser_error", Message: "malformed snapshot result: " + err.Error()}
		}
	}
	items := res.Items
	if items == nil {
		items = []Tab{}
	}
	out, err := json.Marshal(SnapshotResult{Items: items, AnsweredBy: label})
	if err != nil {
		return "", &ToolError{Code: "browser_error", Message: err.Error()}
	}
	return string(out), nil
}
