// Package store provides the SQLite storage layer: WAL mode, embedded
// migrations, single-writer enforcement.
//
// Since migration 0002 the daemon is the durable stash store
// (plan .agents/plans/2026-10-04-daemon-store-extension-library.md):
// record-level last-write-wins on updated_at (ms), soft-delete tombstones
// so a stale re-seed cannot resurrect deleted records, and a monotonic rev
// change feed the host pushes to paired extensions.
package store

import (
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Store wraps the SQLite database. A single connection plus a mutex
// enforces the single-writer rule (spec 4.3); _txlock=immediate serializes
// writers across the separate serve/host processes on one DB file.
type Store struct {
	db *sql.DB
	mu sync.Mutex // serializes writers; readers share the same single conn
}

// recordCols is the full stash_records column list read by every SELECT.
const recordCols = `id,title,url,items_json,created_at,updated_at,origin,deleted,crdt_seq,
	tags_json,note,kept,shares_json,extra_json,rev`

// Open opens (creating) the database at path and applies pending migrations.
func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_txlock=immediate"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// Single connection: one writer, and readers queue on the same conn.
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

// Close closes the database.
func (s *Store) Close() error { return s.db.Close() }

// DB exposes the handle for read-only helpers (doctor, status).
func (s *Store) DB() *sql.DB { return s.db }

func (s *Store) migrate() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return err
	}
	var ups []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".sql") && !strings.HasSuffix(e.Name(), ".down.sql") {
			ups = append(ups, e.Name())
		}
	}
	sort.Strings(ups)
	if _, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`); err != nil {
		return err
	}
	for _, name := range ups {
		v, err := strconv.Atoi(strings.SplitN(name, "_", 2)[0])
		if err != nil {
			return fmt.Errorf("bad migration name %s: %w", name, err)
		}
		var exists int
		if err := s.db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, v).Scan(&exists); err != nil {
			return err
		}
		if exists > 0 {
			continue
		}
		b, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(string(b)); err != nil {
			tx.Rollback()
			return fmt.Errorf("apply %s: %w", name, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)`, v, time.Now().Unix()); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// CurrentVersion returns the highest applied migration version (0 if none).
func (s *Store) CurrentVersion() (int, error) {
	var v int
	err := s.db.QueryRow(`SELECT COALESCE(MAX(version), 0) FROM schema_migrations`).Scan(&v)
	return v, err
}

// Record is one stash_records row: the full StashRecord plus tombstone
// and change-feed metadata.
type Record struct {
	ID         string
	Title      string
	URL        string // first item URL, derived
	ItemsJSON  string
	TagsJSON   string
	Note       sql.NullString
	Kept       bool
	SharesJSON string
	// ExtraJSON holds unknown optional StashRecord fields verbatim so they
	// round-trip back out in ToJSON (forward compat).
	ExtraJSON string
	CreatedAt int64
	UpdatedAt int64 // ms; the LWW clock
	Origin    sql.NullString
	Deleted   bool  // tombstone: kept so stale seeds can't resurrect the id
	CRDTSeq   int64 // legacy column, unused since migration 0002
	Rev       int64 // monotonic change-feed position
}

// Change is one writer's intent; ApplyChange arbitrates it under LWW.
type Change struct {
	Op        string // "create" | "update" | "delete"
	ID        string
	Record    *Record // nil for delete
	UpdatedAt int64   // ms; the writer's clock for this change
	Origin    string  // extension profileId, or "daemon" for MCP writes
}

// ApplyChange applies c under record-level LWW (see plan §3.3). It returns
// applied=false when c loses to the current row — a stale change is not an
// error. A delete of an unknown id still writes a tombstone so a later stale
// seed can't resurrect the record. Every applied change advances rev.
func (s *Store) ApplyChange(c Change) (applied bool, err error) {
	if c.ID == "" {
		return false, errors.New("change has empty id")
	}
	switch c.Op {
	case "create", "update":
		if c.Record == nil {
			return false, fmt.Errorf("change op %q without record", c.Op)
		}
		if c.Record.ID != "" && c.Record.ID != c.ID {
			return false, fmt.Errorf("change id %q != record id %q", c.ID, c.Record.ID)
		}
	case "delete":
	default:
		return false, fmt.Errorf("unknown change op %q", c.Op)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	var exUpdatedAt int64
	var exOrigin sql.NullString
	var exDeleted int
	var exists bool
	err = tx.QueryRow(`SELECT updated_at, origin, deleted FROM stash_records WHERE id = ?`, c.ID).
		Scan(&exUpdatedAt, &exOrigin, &exDeleted)
	switch {
	case err == sql.ErrNoRows:
	case err != nil:
		return false, err
	default:
		exists = true
	}

	apply := false
	switch {
	case !exists:
		// Upsert creates the row; delete creates a tombstone.
		apply = true
	case c.Op == "delete":
		if exDeleted != 0 {
			// Already a tombstone: a strictly newer delete refreshes it.
			apply = c.UpdatedAt > exUpdatedAt
		} else {
			// Delete wins timestamp ties over edits.
			apply = c.UpdatedAt >= exUpdatedAt
		}
	default: // upsert
		if exDeleted != 0 {
			// Only an edit strictly newer than the delete resurrects.
			apply = c.UpdatedAt > exUpdatedAt
		} else {
			apply = c.UpdatedAt > exUpdatedAt ||
				(c.UpdatedAt == exUpdatedAt && c.Origin > exOrigin.String)
		}
	}
	if !apply {
		return false, nil
	}

	var rev int64
	if err := tx.QueryRow(`SELECT COALESCE(MAX(rev),0)+1 FROM stash_records`).Scan(&rev); err != nil {
		return false, err
	}
	origin := sql.NullString{String: c.Origin, Valid: c.Origin != ""}

	if c.Op == "delete" {
		if exists {
			_, err = tx.Exec(`UPDATE stash_records SET deleted = 1, updated_at = ?, origin = ?, rev = ? WHERE id = ?`,
				c.UpdatedAt, origin, rev, c.ID)
		} else {
			_, err = tx.Exec(`INSERT INTO stash_records(id,title,url,items_json,created_at,updated_at,origin,deleted,crdt_seq,tags_json,note,kept,shares_json,extra_json,rev)
				VALUES(?,?,?,?,?,?,?,1,0,'[]',NULL,0,'[]','{}',?)`,
				c.ID, "", "", "[]", c.UpdatedAt, c.UpdatedAt, origin, rev)
		}
		if err != nil {
			return false, err
		}
		return true, tx.Commit()
	}

	r := c.Record
	_, err = tx.Exec(`INSERT INTO stash_records(id,title,url,items_json,created_at,updated_at,origin,deleted,crdt_seq,tags_json,note,kept,shares_json,extra_json,rev)
		VALUES(?,?,?,?,?,?,?,0,0,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET title=excluded.title, url=excluded.url, items_json=excluded.items_json,
		created_at=excluded.created_at, updated_at=excluded.updated_at, origin=excluded.origin, deleted=0,
		crdt_seq=excluded.crdt_seq, tags_json=excluded.tags_json, note=excluded.note, kept=excluded.kept,
		shares_json=excluded.shares_json, extra_json=excluded.extra_json, rev=excluded.rev`,
		r.ID, r.Title, r.URL, orDefault(r.ItemsJSON, "[]"), r.CreatedAt, c.UpdatedAt, origin,
		orDefault(r.TagsJSON, "[]"), r.Note, boolInt(r.Kept), orDefault(r.SharesJSON, "[]"),
		orDefault(r.ExtraJSON, "{}"), rev)
	if err != nil {
		return false, err
	}
	return true, tx.Commit()
}

// ChangesSince returns rows (live and tombstones) with rev > since,
// ascending by rev — the daemon→extension push feed.
func (s *Store) ChangesSince(since int64, limit int) ([]Record, error) {
	rows, err := s.db.Query(`SELECT `+recordCols+` FROM stash_records WHERE rev > ? ORDER BY rev ASC LIMIT ?`, since, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRecords(rows)
}

// LiveCount returns the number of non-deleted records.
func (s *Store) LiveCount() (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM stash_records WHERE deleted = 0`).Scan(&n)
	return n, err
}

// MaxRev returns the current change-feed head (0 for an empty store).
func (s *Store) MaxRev() (int64, error) {
	var n int64
	err := s.db.QueryRow(`SELECT COALESCE(MAX(rev),0) FROM stash_records`).Scan(&n)
	return n, err
}

// GetRecord fetches a non-deleted record by id.
func (s *Store) GetRecord(id string) (*Record, error) {
	row := s.db.QueryRow(`SELECT `+recordCols+` FROM stash_records WHERE id = ? AND deleted = 0`, id)
	return scanOne(row)
}

// SearchRecords does a substring match over title, url, tags and note —
// the surface stash_search advertises.
func (s *Store) SearchRecords(q string) ([]Record, error) {
	like := "%" + q + "%"
	rows, err := s.db.Query(`SELECT `+recordCols+` FROM stash_records
		WHERE deleted = 0 AND (title LIKE ? OR url LIKE ? OR tags_json LIKE ? OR note LIKE ?)
		ORDER BY updated_at DESC`, like, like, like, like)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRecords(rows)
}

// ListRecords returns all non-deleted records newest-updated first.
func (s *Store) ListRecords() ([]Record, error) {
	rows, err := s.db.Query(`SELECT ` + recordCols + ` FROM stash_records WHERE deleted = 0 ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRecords(rows)
}

func scanOne(row *sql.Row) (*Record, error) {
	var r Record
	var del, kept int
	err := row.Scan(&r.ID, &r.Title, &r.URL, &r.ItemsJSON, &r.CreatedAt, &r.UpdatedAt, &r.Origin,
		&del, &r.CRDTSeq, &r.TagsJSON, &r.Note, &kept, &r.SharesJSON, &r.ExtraJSON, &r.Rev)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r.Deleted = del != 0
	r.Kept = kept != 0
	return &r, nil
}

func scanRecords(rows *sql.Rows) ([]Record, error) {
	var out []Record
	for rows.Next() {
		var r Record
		var del, kept int
		if err := rows.Scan(&r.ID, &r.Title, &r.URL, &r.ItemsJSON, &r.CreatedAt, &r.UpdatedAt, &r.Origin,
			&del, &r.CRDTSeq, &r.TagsJSON, &r.Note, &kept, &r.SharesJSON, &r.ExtraJSON, &r.Rev); err != nil {
			return nil, err
		}
		r.Deleted = del != 0
		r.Kept = kept != 0
		out = append(out, r)
	}
	return out, rows.Err()
}

// SetConfig writes a resolved config key.
func (s *Store) SetConfig(key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`INSERT INTO config(key, value) VALUES(?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

// GetConfig reads a resolved config key ("" if absent).
func (s *Store) GetConfig(key string) (string, error) {
	var v string
	err := s.db.QueryRow(`SELECT value FROM config WHERE key = ?`, key).Scan(&v)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return v, err
}

// SyncPeer is one sync_state row plus its push lag (unacked rev distance
// between the feed head and the last rev this peer confirmed).
type SyncPeer struct {
	PeerID      string
	LastSyncAt  sql.NullInt64
	LastSentSeq sql.NullInt64
	LastRecvSeq sql.NullInt64
	Status      sql.NullString
	Lag         int64
}

// UpsertSyncState records sync bookkeeping for a peer.
func (s *Store) UpsertSyncState(p SyncPeer) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`INSERT INTO sync_state(peer_id, last_sync_at, last_sent_seq, last_recv_seq, status)
		VALUES(?,?,?,?,?)
		ON CONFLICT(peer_id) DO UPDATE SET last_sync_at=excluded.last_sync_at, last_sent_seq=excluded.last_sent_seq,
		last_recv_seq=excluded.last_recv_seq, status=excluded.status`,
		p.PeerID, p.LastSyncAt, p.LastSentSeq, p.LastRecvSeq, p.Status)
	return err
}

// SyncPeers lists all sync_state rows with per-peer push lag.
func (s *Store) SyncPeers() ([]SyncPeer, error) {
	rows, err := s.db.Query(`SELECT peer_id, last_sync_at, last_sent_seq, last_recv_seq, status,
		(SELECT COALESCE(MAX(rev),0) FROM stash_records) - COALESCE(last_sent_seq,0) AS lag
		FROM sync_state`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SyncPeer
	for rows.Next() {
		var p SyncPeer
		if err := rows.Scan(&p.PeerID, &p.LastSyncAt, &p.LastSentSeq, &p.LastRecvSeq, &p.Status, &p.Lag); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
