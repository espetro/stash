-- Full StashRecord columns + monotonic change-feed rev (plan
-- .agents/plans/2026-10-04-daemon-store-extension-library.md §3.2).
-- The daemon becomes the durable store: record-level LWW on updated_at,
-- soft-delete tombstones, rev feed for daemon→extension push.

ALTER TABLE stash_records ADD COLUMN tags_json   TEXT NOT NULL DEFAULT '[]';
ALTER TABLE stash_records ADD COLUMN note        TEXT;
ALTER TABLE stash_records ADD COLUMN kept        INTEGER NOT NULL DEFAULT 1;
ALTER TABLE stash_records ADD COLUMN shares_json TEXT NOT NULL DEFAULT '[]';
-- Unknown optional StashRecord fields round-trip untouched (forward compat).
ALTER TABLE stash_records ADD COLUMN extra_json  TEXT NOT NULL DEFAULT '{}';
ALTER TABLE stash_records ADD COLUMN rev         INTEGER NOT NULL DEFAULT 0;

-- DeleteRecord historically wrote updated_at in seconds; every other writer
-- (and the LWW clock) uses milliseconds. Fix legacy tombstone timestamps.
UPDATE stash_records SET updated_at = updated_at * 1000 WHERE updated_at < 100000000000;

-- Seed the change feed for pre-existing rows.
UPDATE stash_records SET rev = rowid;

-- Doctor's old crdt-binding probe wrote a real row under this id.
DELETE FROM stash_records WHERE id = '__doctor_probe__';

-- Legacy dead writes: outbox rows held items JSON and were never consumed;
-- crdt_doc held items JSON / doctor probe bytes, not an Automerge document.
DELETE FROM outbox;
DELETE FROM crdt_doc;

CREATE INDEX idx_stash_records_rev ON stash_records(rev);
