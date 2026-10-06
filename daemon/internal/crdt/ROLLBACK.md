# F6 rollback runbook (automerge-go toolchain break)

Plan: `.agents/plans/2026-08-29-local-first-f06-crdt-adoption.md` W5.
Spike evidence: `spikes/crdt-interop/RESULTS.md` (escape hatch not required by
any spike finding; documented here as the fallback contract, spec §6.4).

## Trigger

A future Go release fails to build `github.com/automerge/automerge-go
v0.0.0-20241030180337-6fb4f2d08244` against its vendored static cores
(`deps/libautomerge_core_*.a`). Symptom: `CGO_ENABLED=1 go build ./...` in
`daemon/` fails inside the automerge-go cgo shim, and the vendored core cannot
be regenerated (no Rust toolchain contract on the daemon build).

## Fallback order (spec §6.2)

### Step 1: opaque-blob escape hatch (spec §6.4)

The daemon already stores the CRDT document as an opaque blob (`crdt_doc.blob`,
written transactionally with the `stash_records` materialized view by
`store.PutRecord`). The escape hatch demotes the daemon from CRDT participant
to blob store:

1. A Bun sidecar owns `Automerge.merge` (it already exists as a proven runtime
   in the spike and the extension). The daemon stops linking automerge-go; the
   `crdt` package is replaced by pass-through blob reads/writes
   (`store.CRDTDoc` / `PutRecord` already accept raw bytes).
2. Costs (accepted, per spec §6.4): the daemon cannot answer MCP queries from
   merged state without the sidecar, unless the sidecar also pushes a
   denormalized read model into `stash_records` (which is exactly the
   transaction shape the store already supports).
3. Extension downgrade safety (spec §11.2): the plain
   `browser.storage.local` array remains a valid tier-1 store; the extension
   keeps writing the materialized view and queues deltas while the daemon is
   degraded.

Scripted drill: `scripts/rollback-drill.sh` (repo root of `daemon/`) breaks the
cgo build in a scratch worktree, verifies the daemon still compiles with the
escape-hatch build tag, and restores tier-1 behavior.

### Step 2: pure-Go Yjs port (spec §6.3)

If Automerge is dropped entirely: port the document model to a pure-Go Yjs
port so `CGO_ENABLED=0` returns. Open question deferred to that decision: which
port carries the `yjs` conformance CI suite (owner: F6 only if Automerge is
dropped). Migration: re-wrap from the materialized tier-1 array (below).

### Step 3: import/export (spec §6.5)

Last resort: export every profile doc to JSON (`crdt.Doc.ListRecords()` →
JSON vector, same shape as the F3 conformance fixtures), then import into
whatever engine replaces Automerge. The materialized `stash_records` view is
always derivable from the doc and vice versa, so the export is lossless for
the record field set.

## Downgrade path (spec §11.2, tier 1)

1. Stop the daemon. The extension detects the missing peer and switches to
   tier 1: `browser.storage.local` stays authoritative, all reads/writes hit
   the materialized array, no deltas are produced.
2. The daemon-side doc goes stale but is never deleted (`crdt_doc` row is
   kept). On daemon return, the extension re-wraps: it writes the current
   materialized array as creates into the (stale) doc — the same idempotent
   wrap path as F6/W1, dedup by `createdAt` + first item URL. Diverged local
   edits merge as CRDT creates, not last-write-wins.
3. Removing the daemon permanently is safe: tier 1 is self-sufficient; the
   doc is simply abandoned.

## Verifying the drill

After executing Step 1 on a broken build:

- `CGO_ENABLED=0 go build ./...` passes (no cgo in the binary).
- `stash-daemon doctor` reports the crdt check as the degraded (blob) path.
- Extension UI shows "Daemon offline" only while the daemon is down; sync
  resumes after rollback with no duplicate records (dedup on re-wrap).
