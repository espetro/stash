-- Down migration for 0002_full_record.
-- Requires SQLite >= 3.35 (bundled modernc.org/sqlite v1.34.4 ships 3.46+).
DROP INDEX IF EXISTS idx_stash_records_rev;
ALTER TABLE stash_records DROP COLUMN tags_json;
ALTER TABLE stash_records DROP COLUMN note;
ALTER TABLE stash_records DROP COLUMN kept;
ALTER TABLE stash_records DROP COLUMN shares_json;
ALTER TABLE stash_records DROP COLUMN extra_json;
ALTER TABLE stash_records DROP COLUMN rev;
