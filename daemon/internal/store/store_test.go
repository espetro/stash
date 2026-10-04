package store

import (
	"database/sql"
	"fmt"
	"sync"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func tmpStore(t *testing.T) *Store {
	t.Helper()
	st, err := Open(t.TempDir() + "/stash.db")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	return st
}

// applyV1Schema creates a store-shaped database at migration version 1 with
// legacy data (seconds timestamps, probe row, outbox/crdt_doc rows).
func applyV1Schema(t *testing.T, path string) {
	t.Helper()
	ddl, err := migrationsFS.ReadFile("migrations/0001_init.sql")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(string(ddl)); err != nil {
		t.Fatalf("apply v1: %v", err)
	}
	stmts := []string{
		`INSERT INTO schema_migrations(version, applied_at) VALUES (1, 'test')`,
		// updated_at in seconds (the legacy bug).
		`INSERT INTO stash_records(id,title,url,items_json,created_at,updated_at,origin,deleted,crdt_seq)
		 VALUES('a','A','https://a','[{"url":"https://a"}]',1700000000000,1700000000,NULL,0,0)`,
		`INSERT INTO stash_records(id,title,url,items_json,created_at,updated_at,origin,deleted,crdt_seq)
		 VALUES('__doctor_probe__','p','probe://x','[]',1,1,NULL,0,0)`,
		`INSERT INTO outbox(peer_id,op,payload,created_at) VALUES('ext','x','x',1)`,
		`INSERT INTO crdt_doc(id,blob,updated_at) VALUES(1,'x',1)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("seed v1: %v", err)
		}
	}
}

func TestMigration0002Up(t *testing.T) {
	path := t.TempDir() + "/stash.db"
	applyV1Schema(t, path)
	st, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	if v, _ := st.CurrentVersion(); v != 2 {
		t.Fatalf("version = %d, want 2", v)
	}
	r, err := st.GetRecord("a")
	if err != nil || r == nil {
		t.Fatal(err)
	}
	// seconds → ms
	if r.UpdatedAt != 1700000000000 {
		t.Fatalf("updated_at = %d, want ms", r.UpdatedAt)
	}
	// rev = rowid (probe was rowid 2; 'a' is rowid 1)
	if r.Rev != 1 {
		t.Fatalf("rev = %d, want 1", r.Rev)
	}
	if !r.Kept || r.TagsJSON != "[]" || r.SharesJSON != "[]" || r.ExtraJSON != "{}" {
		t.Fatalf("unexpected defaults: %+v", r)
	}
	// probe row deleted
	if p, _ := st.GetRecord("__doctor_probe__"); p != nil {
		t.Fatal("probe row still present")
	}
	// outbox/crdt_doc emptied
	var n int
	if err := st.DB().QueryRow(`SELECT COUNT(*) FROM outbox`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("outbox count=%d err=%v", n, err)
	}
	if err := st.DB().QueryRow(`SELECT COUNT(*) FROM crdt_doc`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("crdt_doc count=%d err=%v", n, err)
	}
}

func TestMigration0002Down(t *testing.T) {
	st := tmpStore(t)
	down, err := migrationsFS.ReadFile("migrations/0002_full_record.down.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB().Exec(string(down)); err != nil {
		t.Fatalf("down: %v", err)
	}
	// new columns gone
	var rev int64
	if err := st.DB().QueryRow(`SELECT rev FROM stash_records LIMIT 1`).Scan(&rev); err == nil {
		t.Fatal("rev column still present after down")
	}
	// base schema still works
	var n int
	if err := st.DB().QueryRow(`SELECT COUNT(*) FROM stash_records`).Scan(&n); err != nil {
		t.Fatalf("base table broken after down: %v", err)
	}
}

func rec(id string, updatedAt int64) *Record {
	return &Record{
		ID: id, Title: id, URL: "https://" + id,
		ItemsJSON: `[{"url":"https://` + id + `"}]`,
		TagsJSON:  "[]", SharesJSON: "[]", ExtraJSON: "{}",
		CreatedAt: 1, UpdatedAt: updatedAt, Kept: true,
	}
}

func mustApply(t *testing.T, st *Store, c Change) bool {
	t.Helper()
	ap, err := st.ApplyChange(c)
	if err != nil {
		t.Fatalf("ApplyChange(%v): %v", c, err)
	}
	return ap
}

func get(t *testing.T, st *Store, id string) *Record {
	t.Helper()
	r, err := st.GetRecord(id)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func TestApplyChangeLWWMatrix(t *testing.T) {
	st := tmpStore(t)

	// delete with no row → tombstone (GetRecord filters deleted rows, so
	// assert via the raw table)
	if !mustApply(t, st, Change{Op: "delete", ID: "ghost", UpdatedAt: 10, Origin: "p"}) {
		t.Fatal("delete of absent row not applied")
	}
	if !isDeleted(t, st, "ghost") {
		t.Fatal("tombstone missing")
	}

	// upsert vs live: newer wins, older loses
	mustApply(t, st, Change{Op: "create", ID: "x", Record: rec("x", 100), UpdatedAt: 100, Origin: "a"})
	if mustApply(t, st, Change{Op: "update", ID: "x", Record: rec("x", 99), UpdatedAt: 99, Origin: "b"}) {
		t.Fatal("stale upsert applied")
	}
	if !mustApply(t, st, Change{Op: "update", ID: "x", Record: rec("x", 101), UpdatedAt: 101, Origin: "b"}) {
		t.Fatal("newer upsert not applied")
	}

	// equal updatedAt → higher origin wins (lexicographic tie-break)
	mustApply(t, st, Change{Op: "update", ID: "tie", Record: rec("tie", 50), UpdatedAt: 50, Origin: "bbb"})
	if mustApply(t, st, Change{Op: "update", ID: "tie", Record: rec("tie", 50), UpdatedAt: 50, Origin: "aaa"}) {
		t.Fatal("lower-origin tie upsert applied")
	}
	if !mustApply(t, st, Change{Op: "update", ID: "tie", Record: rec("tie", 50), UpdatedAt: 50, Origin: "ccc"}) {
		t.Fatal("higher-origin tie upsert not applied")
	}
	if o := get(t, st, "tie").Origin.String; o != "ccc" {
		t.Fatalf("tie origin = %q, want ccc", o)
	}

	// upsert vs tombstone: strictly newer resurrects; equal loses
	mustApply(t, st, Change{Op: "delete", ID: "x", UpdatedAt: 200, Origin: "a"})
	if !isDeleted(t, st, "x") {
		t.Fatal("delete of live row not applied")
	}
	if mustApply(t, st, Change{Op: "update", ID: "x", Record: rec("x", 200), UpdatedAt: 200, Origin: "z"}) {
		t.Fatal("equal-ts upsert resurrected a tombstone")
	}
	if !mustApply(t, st, Change{Op: "update", ID: "x", Record: rec("x", 201), UpdatedAt: 201, Origin: "z"}) {
		t.Fatal("newer upsert failed to resurrect")
	}
	if r := get(t, st, "x"); r == nil || r.Deleted {
		t.Fatal("row not resurrected")
	}

	// delete vs live: equal ts applies (delete wins ties); stale loses
	mustApply(t, st, Change{Op: "update", ID: "del", Record: rec("del", 300), UpdatedAt: 300, Origin: "a"})
	if mustApply(t, st, Change{Op: "delete", ID: "del", UpdatedAt: 299, Origin: "b"}) {
		t.Fatal("stale delete applied")
	}
	if !mustApply(t, st, Change{Op: "delete", ID: "del", UpdatedAt: 300, Origin: "b"}) {
		t.Fatal("equal-ts delete not applied (delete must win ties)")
	}
	// delete vs tombstone: newer refreshes
	if !mustApply(t, st, Change{Op: "delete", ID: "del", UpdatedAt: 400, Origin: "c"}) {
		t.Fatal("re-delete of tombstone not applied")
	}
	var ts int64
	if err := st.DB().QueryRow(`SELECT updated_at FROM stash_records WHERE id = 'del'`).Scan(&ts); err != nil || ts != 400 {
		t.Fatalf("tombstone ts = %d, err %v, want 400", ts, err)
	}
}

func TestApplyChangeValidation(t *testing.T) {
	st := tmpStore(t)
	for _, c := range []Change{
		{Op: "update", ID: "", Record: rec("x", 1)},
		{Op: "bogus", ID: "x", Record: rec("x", 1)},
		{Op: "update", ID: "x", Record: nil},
		{Op: "update", ID: "x", Record: rec("y", 1)},
		{Op: "delete", ID: ""},
	} {
		if _, err := st.ApplyChange(c); err == nil {
			t.Fatalf("ApplyChange(%+v) want error", c)
		}
	}
}

// isDeleted reads the raw deleted flag (GetRecord filters tombstones).
func isDeleted(t *testing.T, st *Store, id string) bool {
	t.Helper()
	var del int
	if err := st.DB().QueryRow(`SELECT deleted FROM stash_records WHERE id = ?`, id).Scan(&del); err != nil {
		t.Fatal(err)
	}
	return del != 0
}

// Two Store handles on one file writing concurrently must still produce a
// unique, monotonic rev per applied change (the _txlock=immediate DSN).
func TestRevMonotonicAcrossHandles(t *testing.T) {
	path := t.TempDir() + "/stash.db"
	s1, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s1.Close()
	s2, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()

	const n = 20
	revs := make(chan int64, 2*n)
	var wg sync.WaitGroup
	for h, st := range []*Store{s1, s2} {
		for i := 0; i < n; i++ {
			wg.Add(1)
			go func(st *Store, h, i int) {
				defer wg.Done()
				// Distinct ids per handle: every apply is a fresh insert.
				r := rec(fmt.Sprintf("r-h%d-%d", h, i), 1)
				if applied, err := st.ApplyChange(Change{Op: "create", ID: r.ID, Record: r, UpdatedAt: 1, Origin: "t"}); err == nil && applied {
					var rev int64
					if err := st.DB().QueryRow(`SELECT rev FROM stash_records WHERE id = ?`, r.ID).Scan(&rev); err == nil {
						revs <- rev
					}
				}
			}(st, h, i)
		}
	}
	wg.Wait()
	close(revs)
	seen := map[int64]bool{}
	for rev := range revs {
		if seen[rev] {
			t.Fatalf("duplicate rev %d", rev)
		}
		seen[rev] = true
	}
	if len(seen) != 2*n {
		t.Fatalf("only %d unique revs from %d writers", len(seen), 2*n)
	}
}

func TestChangesSinceAndLiveCount(t *testing.T) {
	st := tmpStore(t)
	mustApply(t, st, Change{Op: "create", ID: "a", Record: rec("a", 10), UpdatedAt: 10, Origin: "x"})
	mustApply(t, st, Change{Op: "create", ID: "b", Record: rec("b", 11), UpdatedAt: 11, Origin: "y"})
	mustApply(t, st, Change{Op: "delete", ID: "a", UpdatedAt: 12, Origin: "x"})
	if n, _ := st.LiveCount(); n != 1 {
		t.Fatalf("LiveCount = %d, want 1", n)
	}
	rows, err := st.ChangesSince(0, 10)
	if err != nil || len(rows) != 2 {
		t.Fatalf("ChangesSince = %v rows err=%v", len(rows), err)
	}
	if rows[0].Rev >= rows[1].Rev {
		t.Fatal("ChangesSince not ordered by rev")
	}
	rows, _ = st.ChangesSince(rows[0].Rev, 10)
	if len(rows) != 1 || rows[0].ID != "a" || !rows[0].Deleted {
		t.Fatalf("incremental ChangesSince = %+v", rows)
	}
	if m, _ := st.MaxRev(); m != rows[0].Rev {
		t.Fatalf("MaxRev = %d", m)
	}
}

func TestSearchRecords(t *testing.T) {
	st := tmpStore(t)
	r1 := rec("a", 1)
	r1.TagsJSON = `["golang","db"]`
	r1.Note = sql.NullString{String: "reading list", Valid: true}
	mustApply(t, st, Change{Op: "create", ID: "a", Record: r1, UpdatedAt: 1, Origin: "x"})
	r2 := rec("b", 1)
	r2.Title = "sqlite internals"
	mustApply(t, st, Change{Op: "create", ID: "b", Record: r2, UpdatedAt: 1, Origin: "x"})
	mustApply(t, st, Change{Op: "delete", ID: "b", UpdatedAt: 2, Origin: "x"})

	for q, want := range map[string][]string{
		"golang":    {"a"},
		"reading":   {"a"},
		"sqlite":    {},
		"https://a": {"a"},
		"zzz":       {},
	} {
		got, err := st.SearchRecords(q)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != len(want) || (len(want) > 0 && got[0].ID != want[0]) {
			t.Fatalf("search %q = %+v, want %v", q, got, want)
		}
	}
}

func TestGetMissing(t *testing.T) {
	st := tmpStore(t)
	r, err := st.GetRecord("nope")
	if err != nil || r != nil {
		t.Fatalf("GetRecord = %+v, %v", r, err)
	}
}

func TestConcurrentReadsSingleWriter(t *testing.T) {
	st := tmpStore(t)
	done := make(chan struct{})
	go func() {
		for i := 0; ; i++ {
			select {
			case <-done:
				return
			default:
				r := rec(fmt.Sprintf("%d", i), int64(i))
				st.ApplyChange(Change{Op: "create", ID: r.ID, Record: r, UpdatedAt: int64(i), Origin: "w"})
			}
		}
	}()
	for i := 0; i < 50; i++ {
		st.SearchRecords("a")
		st.ListRecords()
		st.LiveCount()
	}
	close(done)
}

func TestSyncStateRoundTrip(t *testing.T) {
	st := tmpStore(t)
	p := SyncPeer{PeerID: "ext-1", Status: sql.NullString{String: "online", Valid: true},
		LastSentSeq: sql.NullInt64{Int64: 7, Valid: true},
		LastSyncAt:  sql.NullInt64{Int64: time.Now().UnixMilli(), Valid: true}}
	if err := st.UpsertSyncState(p); err != nil {
		t.Fatal(err)
	}
	peers, err := st.SyncPeers()
	if err != nil || len(peers) != 1 {
		t.Fatalf("SyncPeers = %v, %v", peers, err)
	}
	if peers[0].Status.String != "online" || peers[0].LastSentSeq.Int64 != 7 {
		t.Fatalf("peer = %+v", peers[0])
	}
}

func TestConfig(t *testing.T) {
	st := tmpStore(t)
	if v, _ := st.GetConfig("k"); v != "" {
		t.Fatal("unexpected config")
	}
	st.SetConfig("k", "v")
	if v, _ := st.GetConfig("k"); v != "v" {
		t.Fatal("config round trip failed")
	}
}
