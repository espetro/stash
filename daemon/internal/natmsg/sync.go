// Browser-library sync (PR D, plan
// .agents/plans/2026-10-04-daemon-store-extension-library.md §3.5): the
// daemon is the durable store. It answers the extension's stash_sync_* ops
// (ping, seed, change) under record-level LWW, and pushes daemon-side
// changes (MCP writes, other profiles) back over the same op channel.
//
// Wire contract (already spoken by apps/extension/lib/sync/):
//
//   - extension → daemon ops get a reply with the SAME correlationId:
//     opResult = ok, error/timeout = NACK. The outbox stops at the first
//     NACK, so stale AND invalid changes are still acked applied:false.
//   - daemon → extension push: op{tool:"stash_sync_change"} with a
//     daemon-minted correlationId; the extension acks with a freshly minted
//     opResult{result:{ack: <push correlationId>}}. The ack does NOT echo
//     the push's id, so pushes correlate on result.ack, not correlationId.
package natmsg

import (
	"database/sql"
	"encoding/json"
	"sync"
	"time"

	"github.com/espetro/stash/daemon/internal/logging"
	"github.com/espetro/stash/daemon/internal/store"
)

// Sync tool names (extension lib/sync/protocol.ts SYNC_TOOLS).
const (
	ToolSyncPing   = "stash_sync_ping"
	ToolSyncPong   = "stash_sync_pong"
	ToolSyncSeed   = "stash_sync_seed"
	ToolSyncChange = "stash_sync_change"
)

const (
	// pushAckTimeout matches the snapshot request budget (spec 4.4).
	pushAckTimeout = 5 * time.Second
	pushTick       = time.Second
	pushBatchLimit = 200
)

// syncSeedArgs / syncChangeArgs mirror the extension's SeedPayload and
// ChangeRecord (lib/sync/protocol.ts).
type syncSeedArgs struct {
	Records []json.RawMessage `json:"records"`
	Origin  string            `json:"origin"`
}

type syncChangeArgs struct {
	Op        string          `json:"op"`
	ID        string          `json:"id"`
	Record    json.RawMessage `json:"record"`
	UpdatedAt int64           `json:"updatedAt"`
	Origin    string          `json:"origin"`
}

// pushTracker correlates daemon pushes to their result.ack replies.
type pushTracker struct {
	mu      sync.Mutex
	pending map[string]chan struct{}
}

func newPushTracker() *pushTracker {
	return &pushTracker{pending: map[string]chan struct{}{}}
}

func (t *pushTracker) expect(cid string) chan struct{} {
	ch := make(chan struct{}, 1)
	t.mu.Lock()
	t.pending[cid] = ch
	t.mu.Unlock()
	return ch
}

func (t *pushTracker) cancel(cid string) {
	t.mu.Lock()
	delete(t.pending, cid)
	t.mu.Unlock()
}

// delivered consumes env when it is an opResult carrying result.ack that
// matches a pending push; reports whether the frame was consumed.
func (t *pushTracker) delivered(env *Envelope) bool {
	if env.Type != TypeOpResult {
		return false
	}
	var or OpResultPayload
	if err := json.Unmarshal(env.Payload, &or); err != nil {
		return false
	}
	var res struct {
		Ack string `json:"ack"`
	}
	if err := json.Unmarshal(or.Result, &res); err != nil || res.Ack == "" {
		return false
	}
	t.mu.Lock()
	ch, ok := t.pending[res.Ack]
	if ok {
		delete(t.pending, res.Ack)
	}
	t.mu.Unlock()
	if ok {
		ch <- struct{}{}
	}
	return ok
}

// connSync owns one browser connection's sync state: inbound op handling
// plus the push loop that streams daemon-side changes back.
type connSync struct {
	st    *store.Store
	lw    *logging.Writer
	write func(*Envelope) error // goroutine-safe
	acks  *pushTracker

	kickCh chan struct{}
	done   chan struct{}
	once   sync.Once

	mu           sync.Mutex
	origin       string // extension profileId, learned from the seed
	pushStarted  bool
	restoreUntil int64 // >0: push live rows with rev <= this, any origin
	resetCursor  bool  // set by a re-seed that re-triggers restore
}

func newConnSync(st *store.Store, lw *logging.Writer, write func(*Envelope) error) *connSync {
	return &connSync{
		st: st, lw: lw, write: write,
		acks: newPushTracker(), kickCh: make(chan struct{}, 1), done: make(chan struct{}),
	}
}

func (cs *connSync) stop() {
	cs.once.Do(func() { close(cs.done) })
}

func (cs *connSync) kick() {
	select {
	case cs.kickCh <- struct{}{}:
	default:
	}
}

// handleOp routes one inbound op frame to its sync handler (or errors on
// unknown tools). Replies always echo env.CorrelationID.
func (cs *connSync) handleOp(env *Envelope) {
	var op OpPayload
	if err := json.Unmarshal(env.Payload, &op); err != nil {
		cs.replyError(env.CorrelationID, "bad_op_payload", "malformed op payload: "+err.Error())
		return
	}
	switch op.Tool {
	case ToolSyncPing:
		payload, _ := json.Marshal(OpPayload{Tool: ToolSyncPong})
		cs.write(&Envelope{Type: TypeOp, CorrelationID: env.CorrelationID, Payload: payload})
	case ToolSyncSeed:
		cs.handleSeed(env, op.Args)
	case ToolSyncChange:
		cs.handleChange(env, op.Args)
	default:
		cs.replyError(env.CorrelationID, "unknown_tool", "unknown sync tool: "+op.Tool)
	}
}

func (cs *connSync) handleSeed(env *Envelope, args json.RawMessage) {
	var seed syncSeedArgs
	if err := json.Unmarshal(args, &seed); err != nil {
		cs.replyError(env.CorrelationID, "bad_seed_args", "malformed seed args: "+err.Error())
		return
	}
	applied, stale, invalid := 0, 0, 0
	for _, raw := range seed.Records {
		r, err := store.RecordFromJSON(raw)
		if err != nil {
			invalid++
			cs.lw.Event("warn", "sync seed: invalid record", map[string]any{"err": err.Error()})
			continue
		}
		ok, err := cs.st.ApplyChange(store.Change{
			Op: "update", ID: r.ID, Record: &r, UpdatedAt: r.UpdatedAt, Origin: seed.Origin,
		})
		if err != nil {
			invalid++
			cs.lw.Error("sync seed: apply failed", map[string]any{"err": err.Error()})
			continue
		}
		if ok {
			applied++
		} else {
			stale++
		}
	}

	cs.mu.Lock()
	cs.origin = seed.Origin
	if restore, end := cs.evalRestoreLocked(len(seed.Records) == 0); restore {
		cs.restoreUntil = end
		cs.resetCursor = true
	}
	start := !cs.pushStarted
	cs.pushStarted = true
	cs.mu.Unlock()
	if start {
		go cs.pushLoop()
	} else {
		cs.kick()
	}

	cs.lw.Info("sync seed", map[string]any{
		"origin": seed.Origin, "applied": applied, "stale": stale, "invalid": invalid,
	})
	result, _ := json.Marshal(map[string]any{"applied": applied, "stale": stale, "invalid": invalid})
	cs.replyOpResult(env.CorrelationID, result)
}

func (cs *connSync) handleChange(env *Envelope, args json.RawMessage) {
	invalid := func(msg string) {
		cs.lw.Event("warn", "sync change: invalid", map[string]any{"err": msg})
		result, _ := json.Marshal(map[string]any{"applied": false, "invalid": true})
		cs.replyOpResult(env.CorrelationID, result)
	}

	var ch syncChangeArgs
	if err := json.Unmarshal(args, &ch); err != nil {
		invalid("malformed change args: " + err.Error())
		return
	}
	if ch.ID == "" || (ch.Op != "create" && ch.Op != "update" && ch.Op != "delete") {
		invalid("change missing id or has bad op")
		return
	}

	var applied bool
	var err error
	if ch.Op == "delete" {
		applied, err = cs.st.ApplyChange(store.Change{
			Op: "delete", ID: ch.ID, UpdatedAt: ch.UpdatedAt, Origin: ch.Origin,
		})
	} else {
		if len(ch.Record) == 0 {
			invalid("upsert change without record")
			return
		}
		r, jerr := store.RecordFromJSON(ch.Record)
		if jerr != nil {
			invalid(jerr.Error())
			return
		}
		applied, err = cs.st.ApplyChange(store.Change{
			Op: ch.Op, ID: ch.ID, Record: &r, UpdatedAt: ch.UpdatedAt, Origin: ch.Origin,
		})
	}
	if err != nil {
		// Store failure is not an invalid change: NACK so the extension
		// outbox stops and retries on the next pairing.
		cs.lw.Error("sync change: apply failed", map[string]any{"err": err.Error(), "id": ch.ID})
		cs.replyError(env.CorrelationID, "apply_failed", err.Error())
		return
	}
	result, _ := json.Marshal(map[string]any{"applied": applied})
	cs.replyOpResult(env.CorrelationID, result)
	if applied {
		cs.kick()
	}
}

func (cs *connSync) replyOpResult(correlationID string, result json.RawMessage) {
	payload, _ := json.Marshal(OpResultPayload{Result: result})
	cs.write(&Envelope{Type: TypeOpResult, CorrelationID: correlationID, Payload: payload})
}

func (cs *connSync) replyError(correlationID, code, message string) {
	cs.write(ErrorEnvelope(correlationID, code, message))
}

// evalRestoreLocked reports whether this peer needs a full-library restore
// and the rev watermark it covers (plan §3.5): (a) no sync_state row —
// a new or wiped profile (a wipe regenerates profileId); (b) the seed was
// empty while the daemon holds live rows — a partial wipe that kept the id.
// Caller holds cs.mu; origin must already be set.
func (cs *connSync) evalRestoreLocked(seedEmpty bool) (bool, int64) {
	if cs.origin == "" {
		return false, 0
	}
	peers, err := cs.st.SyncPeers()
	known := false
	if err == nil {
		for _, p := range peers {
			if p.PeerID == cs.origin {
				known = true
				break
			}
		}
	}
	if !known {
		end, _ := cs.st.MaxRev()
		return true, end
	}
	if seedEmpty {
		if n, err := cs.st.LiveCount(); err == nil && n > 0 {
			end, _ := cs.st.MaxRev()
			return true, end
		}
	}
	return false, 0
}

// pushLoop streams store changes to this connection. Started after the
// first seed; runs until the connection drops (cs.done). The cursor is
// sync_state[origin].last_sent_seq — the last rev the peer confirmed; a
// restore starts it at 0 and temporarily sends own-origin rows too.
func (cs *connSync) pushLoop() {
	cs.mu.Lock()
	origin := cs.origin
	cs.mu.Unlock()

	var cursor int64
	peers, err := cs.st.SyncPeers()
	if err == nil {
		for _, p := range peers {
			if p.PeerID == origin && p.LastSentSeq.Valid {
				cursor = p.LastSentSeq.Int64
			}
		}
	}

	ticker := time.NewTicker(pushTick)
	defer ticker.Stop()

	for {
		select {
		case <-cs.done:
			return
		case <-ticker.C:
		case <-cs.kickCh:
		}

		cs.mu.Lock()
		if cs.resetCursor {
			cursor = 0
			cs.resetCursor = false
		}
		cs.mu.Unlock()

		rows, err := cs.st.ChangesSince(cursor, pushBatchLimit)
		if err != nil {
			cs.lw.Error("sync push: changes query failed", map[string]any{"err": err.Error()})
			continue
		}
		for i := range rows {
			row := &rows[i]
			cs.mu.Lock()
			inRestore := cs.restoreUntil > 0 && row.Rev <= cs.restoreUntil
			if !inRestore && row.Rev > cs.restoreUntil {
				cs.restoreUntil = 0
			}
			cs.mu.Unlock()

			send := true
			if row.Deleted {
				// Restore skips tombstones: the wiped peer has nothing to delete.
				send = !inRestore
			} else {
				// Echo suppression: this peer wrote the row, it already has it —
				// except in restore, where own rows are exactly what it needs.
				send = inRestore || row.Origin.String != origin
			}
			if !send {
				cs.saveCursor(origin, row.Rev)
				cursor = row.Rev
				continue
			}
			if !cs.pushChange(row) {
				break // timeout or disconnect: retry from cursor next tick
			}
			cs.saveCursor(origin, row.Rev)
			cursor = row.Rev
		}
	}
}

// pushChange sends one row as a stash_sync_change op and awaits the
// extension's result.ack (it lands on a fresh correlationId, so the
// tracker matches on the ack field, not the envelope id).
func (cs *connSync) pushChange(row *store.Record) bool {
	cid, err := MintCorrelationID("daemon")
	if err != nil {
		cs.lw.Error("sync push: mint correlation id", map[string]any{"err": err.Error()})
		return false
	}
	args := map[string]any{
		"op":        "update",
		"id":        row.ID,
		"updatedAt": row.UpdatedAt,
		"origin":    row.Origin.String,
	}
	if row.Deleted {
		args["op"] = "delete"
	} else {
		args["record"] = row.ToJSON()
	}
	rawArgs, _ := json.Marshal(args)
	payload, _ := json.Marshal(OpPayload{Tool: ToolSyncChange, Args: rawArgs})
	env := &Envelope{Type: TypeOp, CorrelationID: cid, Payload: payload}

	ack := cs.acks.expect(cid)
	if err := cs.write(env); err != nil {
		cs.acks.cancel(cid)
		cs.lw.Error("sync push: write failed", map[string]any{"err": err.Error()})
		return false
	}
	select {
	case <-ack:
		return true
	case <-cs.done:
		cs.acks.cancel(cid)
		return false
	case <-time.After(pushAckTimeout):
		cs.acks.cancel(cid)
		cs.lw.Event("warn", "sync push: ack timeout", map[string]any{"id": row.ID})
		return false
	}
}

// saveCursor persists the peer's feed position and last-activity timestamp.
func (cs *connSync) saveCursor(origin string, rev int64) {
	now := time.Now().UnixMilli()
	if err := cs.st.UpsertSyncState(store.SyncPeer{
		PeerID:      origin,
		LastSentSeq: sql.NullInt64{Int64: rev, Valid: true},
		LastSyncAt:  sql.NullInt64{Int64: now, Valid: true},
	}); err != nil {
		cs.lw.Error("sync push: save cursor", map[string]any{"err": err.Error()})
	}
}
