# Daemon LWW store (PR D)

Sync between extension and daemon is record-level last-writer-wins with
soft-delete tombstones on SQLite, not the spec's Automerge path (spec
§6.6/6.7; the deviation note is §6.8). The `automerge-go` binding had no
production caller and every sync flow ships whole `StashRecord`s, so
per-record LWW on `updatedAt` delivers the no-resurrect guarantee without a
doc-level merge. Tie-breaks: delete wins equal `updatedAt`, then the higher
`origin` string.

Wire-contract gotchas (`daemon/internal/natmsg/sync.go`):

- Extension ops (`stash_sync_ping`/`seed`/`change`) reply on the **same**
  `correlationId`. Daemon pushes use a daemon-minted id, but the extension
  acks on a **fresh** `opResult{result:{ack: <push id>}}` — correlate pushes
  on `result.ack`, not the envelope id.
- Stale AND invalid `stash_sync_change`s are still acked
  (`applied:false`). The extension outbox stops at the first NACK, so a
  permanently rejected change would wedge it forever.
- `rev` is assigned inside the write transaction as
  `SELECT COALESCE(MAX(rev),0)+1 FROM stash_records`. `_txlock=immediate` on
  the DSN makes `Begin()` take the write lock up front, which keeps `rev`
  unique across the two processes (`serve`, `host`) sharing one DB file.
- Restore mode = no `sync_state` row for the origin, or an empty seed while
  `LiveCount() > 0`. The cursor restarts at 0 and sends every live row —
  including own-origin rows — up to `MaxRev` sampled at decision time;
  tombstones are skipped (the wiped peer has nothing to delete).

Fixture clocks: the checked-in payload fixtures are regenerated per release,
which moves their `expiresAt`. Any test that hardcodes a "now" between the
expired and live vectors silently breaks on regeneration — derive the
evaluation instant from the payloads' own expiries (`decodeFixtureNow`),
never hardcode.
