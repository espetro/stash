-- schema_migrations tracks applied migrations; hand-rolled harness.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- Materialized read model (spec 4.3). Writes land in the same transaction
-- as crdt_doc updates so read semantics are always correct.
CREATE TABLE stash_records (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  items_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  origin TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  crdt_seq INTEGER NOT NULL
);

-- Opaque CRDT document placeholder (F6 replaces the blob producer).
CREATE TABLE crdt_doc (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  blob BLOB,
  updated_at INTEGER NOT NULL
);

-- Outbound ops pending relay consumption (F7).
CREATE TABLE outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  peer_id TEXT NOT NULL,
  op TEXT NOT NULL,
  payload BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

-- Per-peer sync bookkeeping.
CREATE TABLE sync_state (
  peer_id TEXT PRIMARY KEY,
  last_sync_at INTEGER,
  last_sent_seq INTEGER,
  last_recv_seq INTEGER,
  status TEXT
);

-- Resolved runtime view of the daemon config (TOML value wins at read time).
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_stash_records_updated ON stash_records(updated_at);
