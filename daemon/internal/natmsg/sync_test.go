package natmsg

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/espetro/stash/daemon/internal/logging"
	"github.com/espetro/stash/daemon/internal/store"
)

// pipeHost runs runHostConn over io.Pipes so tests can interleave frames and
// observe the daemon's pushes, unlike the synchronous bytes.Buffer harness.
type pipeHost struct {
	st       *store.Store
	dbPath   string
	hub      *Hub
	inW      *io.PipeWriter
	frames   chan *Envelope // drained continuously so host writes never block
	done     chan error
	doneSeen atomic.Bool // a test may consume done itself; cleanup skips then
}

func startPipeHost(t *testing.T) *pipeHost {
	t.Helper()
	dbPath := t.TempDir() + "/s.db"
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	lw, _ := logging.New(t.TempDir()+"/l", 1024, 1)
	inR, inW := io.Pipe()
	outR, outW := io.Pipe()
	h := &pipeHost{st: st, dbPath: dbPath, hub: NewHub(), inW: inW, frames: make(chan *Envelope, 256), done: make(chan error, 1)}
	go func() {
		h.done <- runHostConn(st, lw, inR, outW, h.hub)
		outW.Close()
	}()
	go func() {
		dec := NewDecoder(outR)
		for {
			env, err := dec.Decode()
			if err != nil {
				return
			}
			h.frames <- env
		}
	}()
	t.Cleanup(func() {
		inW.Close()
		h.waitDone(5 * time.Second)
		st.Close()
	})
	return h
}

// waitDone asserts the host exits within d; skipped if the test already
// observed the exit (done is a single-value channel).
func (h *pipeHost) waitDone(d time.Duration) {
	if h.doneSeen.Swap(true) {
		return
	}
	select {
	case <-h.done:
	case <-time.After(d):
		// not fatal for tests that intentionally kill mid-work
	}
}

func (h *pipeHost) send(t *testing.T, env *Envelope) {
	t.Helper()
	if err := EncodeFrame(h.inW, env); err != nil {
		t.Fatalf("send: %v", err)
	}
}

func (h *pipeHost) sendOp(t *testing.T, cid, tool string, args map[string]any) {
	t.Helper()
	raw, _ := json.Marshal(args)
	payload, _ := json.Marshal(OpPayload{Tool: tool, Args: raw})
	h.send(t, &Envelope{Type: TypeOp, CorrelationID: cid, Payload: payload})
}

// recv reads one frame with a deadline.
func (h *pipeHost) recv(t *testing.T, timeout time.Duration) *Envelope {
	t.Helper()
	select {
	case env := <-h.frames:
		return env
	case <-time.After(timeout):
		t.Fatal("timed out waiting for frame")
		return nil
	}
}

// recvResult reads until an opResult arrives (push frames may interleave).
func (h *pipeHost) recvResult(t *testing.T, cid string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(4 * time.Second)
	for time.Now().Before(deadline) {
		env := h.recv(t, deadline.Sub(time.Now()))
		if env.Type == TypeOpResult && env.CorrelationID == cid {
			var or OpResultPayload
			if err := json.Unmarshal(env.Payload, &or); err != nil {
				t.Fatal(err)
			}
			var m map[string]any
			if err := json.Unmarshal(or.Result, &m); err != nil {
				t.Fatal(err)
			}
			return m
		}
	}
	t.Fatalf("no opResult for %s", cid)
	return nil
}

// expectQuiet fails if any frame arrives within d.
func (h *pipeHost) expectQuiet(t *testing.T, d time.Duration) {
	t.Helper()
	select {
	case env := <-h.frames:
		t.Fatalf("unexpected frame: %+v", env)
	case <-time.After(d):
	}
}

func (h *pipeHost) hello(t *testing.T) {
	t.Helper()
	h.send(t, &Envelope{Type: TypeHello, CorrelationID: "ext-h0000001",
		Payload: []byte(`{"protocolVersion":"1.0.0","supportedRange":">=1.0.0 <2.0.0","extension":{"name":"Stash","version":"0.9.0"}}`)})
	card := h.recv(t, 2*time.Second)
	if card.Type != TypeServerCard {
		t.Fatalf("hello reply: %+v", card)
	}
}

func resultOf(t *testing.T, env *Envelope) map[string]any {
	t.Helper()
	if env.Type != TypeOpResult {
		t.Fatalf("expected opResult, got %+v", env)
	}
	var or OpResultPayload
	if err := json.Unmarshal(env.Payload, &or); err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(or.Result, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func seedArgs(origin string, records ...map[string]any) map[string]any {
	return map[string]any{"origin": origin, "records": records}
}

func jrecord(id string, updatedAt int64) map[string]any {
	return map[string]any{
		"id": id, "title": id, "items": []map[string]any{{"url": "https://" + id}},
		"kept": true, "createdAt": 1, "updatedAt": updatedAt,
	}
}

func TestSyncPingPong(t *testing.T) {
	h := startPipeHost(t)
	h.hello(t)
	h.sendOp(t, "ext-ping0001", ToolSyncPing, map[string]any{})
	env := h.recv(t, 2*time.Second)
	if env.Type != TypeOp || env.CorrelationID != "ext-ping0001" {
		t.Fatalf("pong frame: %+v", env)
	}
	var op OpPayload
	json.Unmarshal(env.Payload, &op)
	if op.Tool != ToolSyncPong {
		t.Fatalf("pong tool: %s", op.Tool)
	}
}

func TestSyncSeedAndReseed(t *testing.T) {
	h := startPipeHost(t)
	h.hello(t)
	markKnown(t, h.st, "p1") // returning profile: no restore pushes
	h.sendOp(t, "ext-seed0001", ToolSyncSeed, seedArgs("p1", jrecord("s1", 100), jrecord("s2", 100)))
	res := h.recvResult(t, "ext-seed0001")
	if res["applied"] != float64(2) {
		t.Fatalf("seed result: %v", res)
	}
	// Idempotent reseed: same origin + same updatedAt → stale, not applied.
	h.sendOp(t, "ext-seed0002", ToolSyncSeed, seedArgs("p1", jrecord("s1", 100), jrecord("s2", 100)))
	res = h.recvResult(t, "ext-seed0002")
	if res["stale"] != float64(2) || res["applied"] != float64(0) {
		t.Fatalf("reseed result: %v", res)
	}
	// Stale change (older updatedAt) does not overwrite.
	h.sendOp(t, "ext-chg00001", ToolSyncChange, map[string]any{
		"op": "update", "id": "s1", "updatedAt": 50, "origin": "p1",
		"record": jrecord("s1", 50),
	})
	res = h.recvResult(t, "ext-chg00001")
	if res["applied"] != false {
		t.Fatalf("stale change acked applied: %v", res)
	}
	r, _ := h.st.GetRecord("s1")
	if r.UpdatedAt != 100 {
		t.Fatalf("stale change overwrote: updatedAt=%d", r.UpdatedAt)
	}
}

// The no-resurrect guarantee: a reconnect full-upload must not bring back a
// record deleted while the profile was away.
func TestSyncTombstoneBlocksReseed(t *testing.T) {
	h := startPipeHost(t)
	h.hello(t)
	markKnown(t, h.st, "p1")
	h.sendOp(t, "ext-seed0001", ToolSyncSeed, seedArgs("p1", jrecord("s1", 100)))
	h.recvResult(t, "ext-seed0001")
	h.sendOp(t, "ext-del00001", ToolSyncChange, map[string]any{
		"op": "delete", "id": "s1", "updatedAt": 200, "origin": "p1",
	})
	res := h.recvResult(t, "ext-del00001")
	if res["applied"] != true {
		t.Fatalf("delete result: %v", res)
	}
	// Reconnect + full upload of the pre-delete snapshot.
	h.sendOp(t, "ext-seed0002", ToolSyncSeed, seedArgs("p1", jrecord("s1", 100)))
	res = h.recvResult(t, "ext-seed0002")
	if res["stale"] != float64(1) {
		t.Fatalf("reseed result: %v", res)
	}
	var del int
	if err := h.st.DB().QueryRow(`SELECT deleted FROM stash_records WHERE id = 's1'`).Scan(&del); err != nil || del == 0 {
		t.Fatal("reseed resurrected a tombstone")
	}
}

func TestSyncChangeAckMatrix(t *testing.T) {
	h := startPipeHost(t)
	h.hello(t)
	markKnown(t, h.st, "p1")
	h.sendOp(t, "ext-seed0001", ToolSyncSeed, seedArgs("p1"))
	h.recvResult(t, "ext-seed0001")

	// invalid: upsert without record → applied:false + invalid flag (still an ack)
	h.sendOp(t, "ext-chg00001", ToolSyncChange, map[string]any{
		"op": "update", "id": "x", "updatedAt": 10, "origin": "p1",
	})
	res := h.recvResult(t, "ext-chg00001")
	if res["applied"] != false || res["invalid"] != true {
		t.Fatalf("invalid change result: %v", res)
	}
	// valid upsert
	h.sendOp(t, "ext-chg00002", ToolSyncChange, map[string]any{
		"op": "update", "id": "x", "updatedAt": 10, "origin": "p1",
		"record": jrecord("x", 10),
	})
	if res := h.recvResult(t, "ext-chg00002"); res["applied"] != true {
		t.Fatalf("valid change result: %v", res)
	}
	// stale upsert (lower updatedAt) → applied:false, still an ack
	h.sendOp(t, "ext-chg00003", ToolSyncChange, map[string]any{
		"op": "update", "id": "x", "updatedAt": 9, "origin": "p1",
		"record": jrecord("x", 9),
	})
	if res := h.recvResult(t, "ext-chg00003"); res["applied"] != false {
		t.Fatalf("stale change result: %v", res)
	}
	// unknown tool → error frame with the same correlationId
	h.sendOp(t, "ext-chg00004", "stash_sync_nope", map[string]any{})
	env := h.recv(t, 2*time.Second)
	if env.Type != TypeError || env.CorrelationID != "ext-chg00004" {
		t.Fatalf("unknown tool reply: %+v", env)
	}
	var fe FrameError
	json.Unmarshal(env.Payload, &fe)
	if fe.Code != "unknown_tool" {
		t.Fatalf("error code: %s", fe.Code)
	}
}

// markKnown creates the sync_state row that makes origin a returning
// (non-restore) peer, parked at the current rev frontier.
func markKnown(t *testing.T, st *store.Store, origin string) {
	t.Helper()
	mr, _ := st.MaxRev()
	if err := st.UpsertSyncState(store.SyncPeer{
		PeerID:      origin,
		LastSentSeq: sql.NullInt64{Int64: mr, Valid: true},
	}); err != nil {
		t.Fatal(err)
	}
}

func lastSentSeq(t *testing.T, st *store.Store, origin string) int64 {
	t.Helper()
	peers, err := st.SyncPeers()
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range peers {
		if p.PeerID == origin {
			if p.LastSentSeq.Valid {
				return p.LastSentSeq.Int64
			}
			return 0
		}
	}
	return 0
}

func pushedChange(t *testing.T, env *Envelope) (cid, id, op string, origin string) {
	t.Helper()
	if env.Type != TypeOp {
		t.Fatalf("expected op push, got %+v", env)
	}
	var p OpPayload
	if err := json.Unmarshal(env.Payload, &p); err != nil {
		t.Fatal(err)
	}
	if p.Tool != ToolSyncChange {
		t.Fatalf("push tool: %s", p.Tool)
	}
	var a syncChangeArgs
	if err := json.Unmarshal(p.Args, &a); err != nil {
		t.Fatal(err)
	}
	return env.CorrelationID, a.ID, a.Op, a.Origin
}

func (h *pipeHost) ack(t *testing.T, pushCID string) {
	t.Helper()
	res, _ := json.Marshal(map[string]any{"ack": pushCID})
	payload, _ := json.Marshal(OpResultPayload{Result: res})
	h.send(t, &Envelope{Type: TypeOpResult, CorrelationID: "ext-ack00001", Payload: payload})
}

// A daemon-side write (e.g. MCP, other profile) reaches the extension as a
// pushed stash_sync_change within ~2 ticks, and the extension's result.ack
// advances the peer's sync_state cursor.
func TestPushLoopDeliversDaemonChange(t *testing.T) {
	h := startPipeHost(t)
	h.hello(t)
	markKnown(t, h.st, "p1") // simulate an already-synced profile (no restore)
	h.sendOp(t, "ext-seed0001", ToolSyncSeed, seedArgs("p1", jrecord("mine", 10)))
	h.recvResult(t, "ext-seed0001")

	// Daemon-side write from a SECOND handle on the same file, like the
	// stdio MCP server and the NM host sharing one database.
	other, err := store.Open(h.dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	dr := &store.Record{ID: "d1", Title: "d1", URL: "https://d1",
		ItemsJSON: `[{"url":"https://d1"}]`, TagsJSON: "[]", SharesJSON: "[]",
		ExtraJSON: "{}", CreatedAt: 1, UpdatedAt: 500, Kept: true}
	if _, err := other.ApplyChange(store.Change{Op: "create", ID: "d1", Record: dr, UpdatedAt: 500, Origin: "daemon"}); err != nil {
		t.Fatal(err)
	}
	mr, _ := h.st.MaxRev()

	env := h.recv(t, 4*time.Second)
	cid, id, op, origin := pushedChange(t, env)
	if id != "d1" || op != "update" || origin != "daemon" {
		t.Fatalf("push args: id=%s op=%s origin=%s", id, op, origin)
	}
	h.ack(t, cid)
	// cursor advances once the ack lands (next pass or immediately).
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if lastSentSeq(t, h.st, "p1") >= mr {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("last_sent_seq = %d, want >= %d", lastSentSeq(t, h.st, "p1"), mr)
}

// Extension-originated rows are not echoed back to the same profile; the
// cursor still advances past them so later rows aren't starved.
func TestPushEchoSuppression(t *testing.T) {
	h := startPipeHost(t)
	h.hello(t)
	markKnown(t, h.st, "p1")
	h.sendOp(t, "ext-seed0001", ToolSyncSeed, seedArgs("p1", jrecord("mine", 10)))
	h.recvResult(t, "ext-seed0001")

	h.sendOp(t, "ext-chg00001", ToolSyncChange, map[string]any{
		"op": "update", "id": "mine", "updatedAt": 20, "origin": "p1",
		"record": jrecord("mine", 20),
	})
	if res := h.recvResult(t, "ext-chg00001"); res["applied"] != true {
		t.Fatalf("change result: %v", res)
	}
	mr, _ := h.st.MaxRev()
	// Two ticks: the own-origin row must not be pushed, but the cursor moves.
	h.expectQuiet(t, 2500*time.Millisecond)
	if seq := lastSentSeq(t, h.st, "p1"); seq < mr {
		t.Fatalf("last_sent_seq = %d, want >= %d (skipped rows must advance the cursor)", seq, mr)
	}
}

// New profile (no sync_state row): the daemon pushes its whole live library —
// any origin — and skips tombstones.
func TestRestoreNewOrigin(t *testing.T) {
	h := startPipeHost(t)
	h.hello(t)
	for _, id := range []string{"a", "b"} {
		r := &store.Record{ID: id, Title: id, URL: "https://" + id,
			ItemsJSON: `[{"url":"https://` + id + `"}]`, TagsJSON: "[]",
			SharesJSON: "[]", ExtraJSON: "{}", CreatedAt: 1, UpdatedAt: 1, Kept: true}
		h.st.ApplyChange(store.Change{Op: "create", ID: id, Record: r, UpdatedAt: 1, Origin: "daemon"})
	}
	h.st.ApplyChange(store.Change{Op: "delete", ID: "gone", UpdatedAt: 2, Origin: "daemon"})

	h.sendOp(t, "ext-seed0001", ToolSyncSeed, seedArgs("pNew"))
	h.recvResult(t, "ext-seed0001")

	got := map[string]bool{}
	for i := 0; i < 2; i++ {
		env := h.recv(t, 4*time.Second)
		cid, id, op, _ := pushedChange(t, env)
		if op != "update" {
			t.Fatalf("restore pushed %s for %s", op, id)
		}
		got[id] = true
		h.ack(t, cid)
	}
	if !got["a"] || !got["b"] || got["gone"] {
		t.Fatalf("restore pushed %v", got)
	}
	// Tombstone is skipped but still advances the cursor.
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		mr, _ := h.st.MaxRev()
		if lastSentSeq(t, h.st, "pNew") >= mr {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("cursor did not cover tombstone: %d", lastSentSeq(t, h.st, "pNew"))
}

// Known profile whose seed is empty while the daemon holds live rows: partial
// wipe → restore even though sync_state exists.
func TestRestoreEmptySeedKnownOrigin(t *testing.T) {
	h := startPipeHost(t)
	h.hello(t)
	r := &store.Record{ID: "a", Title: "a", URL: "https://a",
		ItemsJSON: `[{"url":"https://a"}]`, TagsJSON: "[]",
		SharesJSON: "[]", ExtraJSON: "{}", CreatedAt: 1, UpdatedAt: 1, Kept: true}
	h.st.ApplyChange(store.Change{Op: "create", ID: "a", Record: r, UpdatedAt: 1, Origin: "daemon"})
	markKnown(t, h.st, "pRet")

	h.sendOp(t, "ext-seed0001", ToolSyncSeed, seedArgs("pRet")) // empty records
	h.recvResult(t, "ext-seed0001")

	env := h.recv(t, 4*time.Second)
	cid, id, _, _ := pushedChange(t, env)
	if id != "a" {
		t.Fatalf("restore pushed %s", id)
	}
	h.ack(t, cid)
}

// If the socket drops while a push awaits its ack, the cursor must not
// advance — the row is re-pushed on the next connection.
func TestDisconnectMidPushKeepsCursor(t *testing.T) {
	h := startPipeHost(t)
	h.hello(t)
	r := &store.Record{ID: "a", Title: "a", URL: "https://a",
		ItemsJSON: `[{"url":"https://a"}]`, TagsJSON: "[]",
		SharesJSON: "[]", ExtraJSON: "{}", CreatedAt: 1, UpdatedAt: 1, Kept: true}
	h.st.ApplyChange(store.Change{Op: "create", ID: "a", Record: r, UpdatedAt: 1, Origin: "daemon"})

	h.sendOp(t, "ext-seed0001", ToolSyncSeed, seedArgs("pNew"))
	h.recvResult(t, "ext-seed0001")

	env := h.recv(t, 4*time.Second)
	if _, id, _, _ := pushedChange(t, env); id != "a" {
		t.Fatalf("first push: %s", id)
	}
	// Never ack; drop the connection.
	h.inW.Close()
	select {
	case <-h.done:
		h.doneSeen.Store(true)
	case <-time.After(5 * time.Second):
		t.Fatal("host did not exit")
	}
	if seq := lastSentSeq(t, h.st, "pNew"); seq != 0 {
		t.Fatalf("last_sent_seq advanced to %d despite unacked push", seq)
	}
}

// Wire fixtures shared with the extension conformance test
// (apps/extension/lib/sync/conformance.test.ts).
func TestSyncFixtures(t *testing.T) {
	fixtures := map[string]func(t *testing.T, env *Envelope){
		"sync_ping.json": func(t *testing.T, env *Envelope) {
			if env.Type != TypeOp || env.CorrelationID != "ping-1" {
				t.Fatalf("ping fixture: %+v", env)
			}
			var op OpPayload
			json.Unmarshal(env.Payload, &op)
			if op.Tool != ToolSyncPing {
				t.Fatalf("ping tool: %s", op.Tool)
			}
		},
		"sync_seed.json": func(t *testing.T, env *Envelope) {
			var op OpPayload
			json.Unmarshal(env.Payload, &op)
			if env.Type != TypeOp || op.Tool != ToolSyncSeed {
				t.Fatalf("seed fixture: %+v", env)
			}
			var a syncSeedArgs
			if err := json.Unmarshal(op.Args, &a); err != nil || a.Origin != "profile-1" || len(a.Records) != 1 {
				t.Fatalf("seed args: %+v %v", a, err)
			}
			if _, err := store.RecordFromJSON(a.Records[0]); err != nil {
				t.Fatalf("seed record invalid: %v", err)
			}
		},
		"sync_change.json": func(t *testing.T, env *Envelope) {
			var op OpPayload
			json.Unmarshal(env.Payload, &op)
			var a syncChangeArgs
			if err := json.Unmarshal(op.Args, &a); err != nil || a.Op != "update" || a.ID != "s1" {
				t.Fatalf("change args: %+v %v", a, err)
			}
			if _, err := store.RecordFromJSON(a.Record); err != nil {
				t.Fatalf("change record invalid: %v", err)
			}
		},
		"sync_push.json": func(t *testing.T, env *Envelope) {
			var op OpPayload
			json.Unmarshal(env.Payload, &op)
			var a syncChangeArgs
			if err := json.Unmarshal(op.Args, &a); err != nil || a.Origin != "daemon" {
				t.Fatalf("push args: %+v %v", a, err)
			}
			if !ValidCorrelationID(env.CorrelationID) {
				t.Fatalf("push cid: %s", env.CorrelationID)
			}
		},
		"sync_push_ack.json": func(t *testing.T, env *Envelope) {
			if env.Type != TypeOpResult {
				t.Fatalf("ack type: %s", env.Type)
			}
			var or OpResultPayload
			json.Unmarshal(env.Payload, &or)
			var res struct {
				Ack string `json:"ack"`
			}
			if err := json.Unmarshal(or.Result, &res); err != nil || res.Ack != "daemon-pushfix1" {
				t.Fatalf("ack result: %s %v", or.Result, err)
			}
		},
	}
	for name, check := range fixtures {
		raw, err := os.ReadFile(filepath.Join("testdata", name))
		if err != nil {
			t.Fatal(err)
		}
		env, err := DecodeFrame(bytes.NewReader(raw))
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		check(t, env)
	}
}
