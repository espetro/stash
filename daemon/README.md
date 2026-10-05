# stash-daemon

Local companion process for the Stash browser extension: native-messaging
host, MCP server for desktop agents, and the durable record store.

## Sync

The daemon's SQLite store (`stash_records`) is the durable authority for
stash records; the extension keeps its `browser.storage.local` copy as a
fallback that works whether or not the daemon is installed. Sync is
bidirectional: the extension sends writes as `stash_sync_change` ops plus a
full `stash_sync_seed` after every pairing, and the daemon pushes records
changed elsewhere back as `stash_sync_change` ops the extension acks.
Conflicts resolve as record-level last-writer-wins on `updatedAt`; deletes
write tombstones so a reconnecting profile's full re-seed cannot resurrect
a record deleted elsewhere. A browser profile the daemon has never seen —
or one whose seed arrives empty — receives a full-library restore on
pairing.
