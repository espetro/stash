-- Down migration for 0001_init.
DROP INDEX IF EXISTS idx_stash_records_updated;
DROP TABLE IF EXISTS config;
DROP TABLE IF EXISTS sync_state;
DROP TABLE IF EXISTS outbox;
DROP TABLE IF EXISTS crdt_doc;
DROP TABLE IF EXISTS stash_records;
DROP TABLE IF EXISTS schema_migrations;
