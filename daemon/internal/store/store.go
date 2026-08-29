// Package store provides the SQLite storage layer: WAL mode, embedded
// migrations, single-writer enforcement.
package store

import (
	"database/sql"
	"embed"
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
// enforces the single-writer rule (spec 4.3).
type Store struct {
	db *sql.DB
	mu sync.Mutex // serializes writers; readers share the same single conn
}

// Open opens (creating) the database at path and applies pending migrations.
func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"
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

// Record is one stash record row of the materialized read model.
type Record struct {
	ID        string
	Title     string
	URL       string
	ItemsJSON string
	CreatedAt int64
	UpdatedAt int64
	Origin    sql.NullString
	Deleted   bool
	CRDTSeq   int64
}

// PutRecord writes a record and appends the opaque CRDT blob placeholder in
// one transaction; the read model and crdt_doc stay consistent (F6 swaps the
// blob producer). It also appends an outbox entry for the future relay (F7).
func (s *Store) PutRecord(r Record, blob []byte, peerID, op string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := time.Now().Unix()
	if _, err := tx.Exec(`INSERT INTO stash_records(id,title,url,items_json,created_at,updated_at,origin,deleted,crdt_seq)
		VALUES(?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET title=excluded.title, url=excluded.url, items_json=excluded.items_json,
		updated_at=excluded.updated_at, origin=excluded.origin, deleted=excluded.deleted, crdt_seq=excluded.crdt_seq`,
		r.ID, r.Title, r.URL, r.ItemsJSON, r.CreatedAt, r.UpdatedAt, r.Origin, boolInt(r.Deleted), r.CRDTSeq); err != nil {
		return err
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

// GetRecord fetches a non-deleted record by id.
func (s *Store) GetRecord(id string) (*Record, error) {
	row := s.db.QueryRow(`SELECT id,title,url,items_json,created_at,updated_at,origin,deleted,crdt_seq
		FROM stash_records WHERE id = ? AND deleted = 0`, id)
	var r Record
	var del int
	if err := row.Scan(&r.ID, &r.Title, &r.URL, &r.ItemsJSON, &r.CreatedAt, &r.UpdatedAt, &r.Origin, &del, &r.CRDTSeq); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	r.Deleted = del != 0
	return &r, nil
}

// DeleteRecord soft-deletes a record; returns whether a row was affected.
func (s *Store) DeleteRecord(id string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	res, err := s.db.Exec(`UPDATE stash_records SET deleted = 1, updated_at = ? WHERE id = ? AND deleted = 0`, time.Now().Unix(), id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// SearchRecords does a substring match over title and url (F6 may upgrade).
func (s *Store) SearchRecords(q string) ([]Record, error) {
	like := "%" + q + "%"
	rows, err := s.db.Query(`SELECT id,title,url,items_json,created_at,updated_at,origin,deleted,crdt_seq
		FROM stash_records WHERE deleted = 0 AND (title LIKE ? OR url LIKE ?) ORDER BY updated_at DESC`, like, like)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRecords(rows)
}

// ListRecords returns all non-deleted records newest-updated first.
func (s *Store) ListRecords() ([]Record, error) {
	rows, err := s.db.Query(`SELECT id,title,url,items_json,created_at,updated_at,origin,deleted,crdt_seq
		FROM stash_records WHERE deleted = 0 ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRecords(rows)
}

func scanRecords(rows *sql.Rows) ([]Record, error) {
	var out []Record
	for rows.Next() {
		var r Record
		var del int
		if err := rows.Scan(&r.ID, &r.Title, &r.URL, &r.ItemsJSON, &r.CreatedAt, &r.UpdatedAt, &r.Origin, &del, &r.CRDTSeq); err != nil {
			return nil, err
		}
		r.Deleted = del != 0
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

// OutboxDepth returns the number of pending outbox entries.
func (s *Store) OutboxDepth() (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM outbox`).Scan(&n)
	return n, err
}

// SyncPeer is one sync_state row.
type SyncPeer struct {
	PeerID      string
	LastSyncAt  sql.NullInt64
	LastSentSeq sql.NullInt64
	LastRecvSeq sql.NullInt64
	Status      sql.NullString
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

// SyncPeers lists all sync_state rows.
func (s *Store) SyncPeers() ([]SyncPeer, error) {
	rows, err := s.db.Query(`SELECT peer_id, last_sync_at, last_sent_seq, last_recv_seq, status FROM sync_state`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SyncPeer
	for rows.Next() {
		var p SyncPeer
		if err := rows.Scan(&p.PeerID, &p.LastSyncAt, &p.LastSentSeq, &p.LastRecvSeq, &p.Status); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// CRDTDoc returns the opaque blob placeholder and its updated_at.
func (s *Store) CRDTDoc() ([]byte, int64, error) {
	var blob []byte
	var ts int64
	err := s.db.QueryRow(`SELECT blob, updated_at FROM crdt_doc WHERE id = 1`).Scan(&blob, &ts)
	if err == sql.ErrNoRows {
		return nil, 0, nil
	}
	return blob, ts, err
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
