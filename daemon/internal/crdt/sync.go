package crdt

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// Sync is the F6 write pipeline: every mutation lands in the Automerge
// document first, and the stash_records materialized view plus the crdt_doc
// head are updated in the SAME SQLite transaction (F2 invariant, kept by W2).
// The blob stored in crdt_doc is the full serialized document state.
type Sync struct {
	st *sql.DB
}

// NewSync binds the write pipeline to an open store handle.
func NewSync(db *sql.DB) *Sync { return &Sync{st: db} }

// LoadDocHead deserializes the stored document head; a missing row yields a
// fresh document (first wrap wins, W1 idempotency).
func (s *Sync) LoadDocHead() (*Doc, error) {
	var blob []byte
	err := s.st.QueryRow(`SELECT blob FROM crdt_doc WHERE id = 1`).Scan(&blob)
	if err == sql.ErrNoRows || (err == nil && len(blob) == 0) {
		return NewDoc()
	}
	if err != nil {
		return nil, err
	}
	return LoadDoc(blob)
}

// Apply mutates the doc via fn, then persists doc head + materialized view +
// outbox entry in one transaction. view lists the records the materialized
// view should hold after the mutation (full replacement of the record's row,
// or row removal when the doc no longer contains the id).
func (s *Sync) Apply(doc *Doc, fn func(*Doc) error, peerID, op string, msg string) error {
	if err := fn(doc); err != nil {
		return err
	}
	if err := doc.Commit(msg); err != nil {
		return err
	}
	blob := doc.Save()
	recs, err := doc.ListRecords()
	if err != nil {
		return err
	}
	tx, err := s.st.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := time.Now().Unix()
	for _, r := range recs {
		items, err := json.Marshal(r)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO stash_records(id,title,url,items_json,created_at,updated_at,origin,deleted,crdt_seq)
			VALUES(?,?,?,?,?,?,?,0,?)
			ON CONFLICT(id) DO UPDATE SET title=excluded.title, url=excluded.url, items_json=excluded.items_json,
			updated_at=excluded.updated_at, origin=excluded.origin, crdt_seq=excluded.crdt_seq, deleted=0`,
			r.ID, r.Title, r.URL, string(items), r.CreatedAt, r.UpdatedAt, r.Origin, r.UpdatedAt); err != nil {
			return fmt.Errorf("crdt: sync view %s: %w", r.ID, err)
		}
	}
	// Hard delete (W4): ids present in the view but gone from the doc are
	// removed from the view — no tombstones.
	rows, err := tx.Query(`SELECT id FROM stash_records WHERE deleted = 0`)
	if err != nil {
		return err
	}
	var stale []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		stale = append(stale, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	inDoc := map[string]bool{}
	for _, r := range recs {
		inDoc[r.ID] = true
	}
	for _, id := range stale {
		if !inDoc[id] {
			if _, err := tx.Exec(`DELETE FROM stash_records WHERE id = ?`, id); err != nil {
				return err
			}
		}
	}
	if _, err := tx.Exec(`INSERT INTO crdt_doc(id, blob, updated_at) VALUES(1, ?, ?)
		ON CONFLICT(id) DO UPDATE SET blob=excluded.blob, updated_at=excluded.updated_at`, blob, now); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO outbox(peer_id, op, payload, created_at) VALUES(?,?,?,?)`,
		peerID, op, blob, now); err != nil {
		return err
	}
	return tx.Commit()
}

// MergeHead merges the peer delta into the stored head, re-materializes the
// view, and persists everything in one transaction. Returns the merged doc.
func (s *Sync) MergeHead(peer *Doc, peerID string) (*Doc, error) {
	doc, err := s.LoadDocHead()
	if err != nil {
		return nil, err
	}
	// Flush the peer's pending queue into its own doc first (automerge-go's
	// AMmerge only transfers changes the source has committed), then merge
	// the peer into the head.
	if err := peer.Commit("sync flush"); err != nil {
		return nil, err
	}
	if _, err := doc.Merge(peer); err != nil {
		return nil, err
	}
	// Wrap-dedup (W1): a peer that wrapped its records into an independent
	// document has a DIFFERENT `records` list object; the root-key conflict
	// resolves to a single list (Automerge picks one deterministically per
	// actor pair), so a plain merge can drop the peer's elements. Merge the
	// peer's records as creates (upsert by id) so a second browser's wrap
	// dedups into the winning doc instead of competing with it.
	peerRecs, err := peer.ListRecords()
	if err != nil {
		return nil, err
	}
	for _, r := range peerRecs {
		if err := doc.PutRecord(r); err != nil {
			return nil, err
		}
	}
	if err := s.Apply(doc, func(*Doc) error { return nil }, peerID, "merge", "merge from "+peerID); err != nil {
		return nil, err
	}
	return doc, nil
}
