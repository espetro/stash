package crdt

import (
	"database/sql"

	_ "modernc.org/sqlite"
	"testing"
)

// openSyncDB builds an in-memory schema matching the daemon store (the
// subset the Sync pipeline touches), mirroring migrations/0001_init.sql.
func openSyncDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", "file::memory:?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	schema := `
	CREATE TABLE stash_records (
		id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL,
		items_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
		origin TEXT, deleted INTEGER NOT NULL DEFAULT 0, crdt_seq INTEGER NOT NULL
	);
	CREATE TABLE crdt_doc (id INTEGER PRIMARY KEY CHECK (id = 1), blob BLOB, updated_at INTEGER NOT NULL);
	CREATE TABLE outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, peer_id TEXT NOT NULL,
		op TEXT NOT NULL, payload BLOB NOT NULL, created_at INTEGER NOT NULL);`
	if _, err := db.Exec(schema); err != nil {
		t.Fatal(err)
	}
	return db
}

// Materialized-view consistency after merge (W4/F2 invariant): a record
// deleted in a concurrent peer disappears from stash_records when the delta
// merges, while untouched records survive with their merged fields.
func TestSyncViewConsistencyAfterMerge(t *testing.T) {
	db := openSyncDB(t)
	s := NewSync(db)

	head, err := s.LoadDocHead()
	if err != nil {
		t.Fatal(err)
	}
	r1, r2 := rec("a", 1), rec("b", 2)
	if err := s.Apply(head, func(d *Doc) error {
		if err := d.PutRecord(r1); err != nil {
			return err
		}
		return d.PutRecord(r2)
	}, "local", "create", "seed"); err != nil {
		t.Fatal(err)
	}

	// Peer concurrently: deletes a, edits b.title.
	peer, err := LoadDoc(head.Save())
	if err != nil {
		t.Fatal(err)
	}
	if ok, err := peer.DeleteRecord("a"); err != nil || !ok {
		t.Fatalf("peer delete: %v %v", ok, err)
	}
	if err := peer.Commit("peer del"); err != nil {
		t.Fatal(err)
	}
	rb, err := peer.GetRecord("b")
	if err != nil {
		t.Fatal(err)
	}
	rb.Title = "edited on peer"
	if err := peer.PutRecord(*rb); err != nil {
		t.Fatal(err)
	}
	if err := peer.Commit("peer edit"); err != nil {
		t.Fatal(err)
	}

	merged, err := s.MergeHead(peer, "browser-1")
	if err != nil {
		t.Fatal(err)
	}

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM stash_records WHERE deleted = 0`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("view has %d rows after merge, want 1 (deleted record must be purged)", count)
	}
	var title string
	if err := db.QueryRow(`SELECT title FROM stash_records WHERE id = 'b'`).Scan(&title); err != nil {
		t.Fatal(err)
	}
	if title != "edited on peer" {
		t.Fatalf("view title %q, want merged value", title)
	}
	var blob []byte
	if err := db.QueryRow(`SELECT blob FROM crdt_doc WHERE id = 1`).Scan(&blob); err != nil {
		t.Fatal(err)
	}
	mdoc, err := LoadDoc(blob)
	if err != nil {
		t.Fatal(err)
	}
	view, err := mdoc.ListRecords()
	if err != nil {
		t.Fatal(err)
	}
	docView, err := merged.ListRecords()
	if err != nil {
		t.Fatal(err)
	}
	if len(view) != 1 || view[0].ID != "b" {
		t.Fatalf("stored doc head diverges from expected state: %+v", view)
	}
	if len(docView) != 1 || docView[0].Title != "edited on peer" {
		t.Fatalf("merged doc wrong: %+v", docView)
	}
	var outbox int
	if err := db.QueryRow(`SELECT COUNT(*) FROM outbox WHERE peer_id = 'browser-1'`).Scan(&outbox); err != nil {
		t.Fatal(err)
	}
	if outbox != 1 {
		t.Fatalf("outbox entries = %d, want 1", outbox)
	}
}

// Wrap idempotency (W1): a second wrap for a profile that already has a doc
// head merges as creates (dedup by id), never as a competing document.
func TestSyncWrapIdempotent(t *testing.T) {
	db := openSyncDB(t)
	s := NewSync(db)

	head, err := s.LoadDocHead()
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Apply(head, func(d *Doc) error { return d.PutRecord(rec("a", 1)) },
		"local", "create", "first wrap"); err != nil {
		t.Fatal(err)
	}

	// Second browser wraps the same record: merge as create dedups by id.
	second, err := NewDoc()
	if err != nil {
		t.Fatal(err)
	}
	if err := second.PutRecord(rec("a", 1)); err != nil {
		t.Fatal(err)
	}
	if err := second.PutRecord(rec("c", 3)); err != nil {
		t.Fatal(err)
	}
	if err := second.Commit("second wrap"); err != nil {
		t.Fatal(err)
	}
	merged, err := s.MergeHead(second, "browser-2")
	if err != nil {
		t.Fatal(err)
	}
	rs, err := merged.ListRecords()
	if err != nil {
		t.Fatal(err)
	}
	if len(rs) != 2 {
		t.Fatalf("wrap dedup failed: %+v", rs)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM stash_records`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("view count = %d, want 2", count)
	}
}
