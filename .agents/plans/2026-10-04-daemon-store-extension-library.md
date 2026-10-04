# Daemon as the persistent store (+ extension fallback) and the extension Library page

Status: **implementation-ready plan** for PR D. PR E is specified at design level.
Base branch: `devin/1791110557-one-library` (#66). PR D branch: `devin/<epoch>-daemon-store-sync`.
Order (decided 2026-10-04): **PR D first**, then PR E.

## 0. Direction (Quim, 2026-10-04)
1. The extension and the viewer share one library unless that's hard to do. The extension may host a full page like OneTab (viewer features plus data management and settings). The popup is then only for **collecting** tabs.
2. The daemon syncs with the extension and viewer without the user having to manage it, and it is the **persistent store**, because browser data is easy to wipe.
3. The extension keeps a **fallback store** for users who can't install the daemon.

## 1. Storage model (all tiers)

| Tier | Where data lives | Authority | Wipe protection |
|---|---|---|---|
| 1, no daemon (fallback) | `browser.storage.local` (`stash-records`) | extension | JSON export only (see §1.1) |
| 2/3, daemon installed | `browser.storage.local` **and** daemon SQLite | daemon is the durable replica; the extension writes locally first, then syncs | the daemon restores the whole library into a wiped or new profile (§3.5) |
| Web without the extension | viewer `localStorage` | viewer | JSON export; one-time handoff into the extension (PR E) |

The tier-1 invariant from spec §2.1/§2.4 still holds: every extension write lands in `storage.local` first and succeeds without a daemon. The daemon is never required for reads or writes.

### 1.1 Fallback store hardening (PR D, extension side, small)
- Add `"unlimitedStorage"` to `wxt.config.ts` permissions. Without it, Chrome caps `storage.local` at 10 MB (https://developer.chrome.com/docs/extensions/reference/api/storage#property-local). *Check before shipping: Chrome currently shows no install warning for this permission (https://developer.chrome.com/docs/extensions/reference/permissions-list). Confirm that adding it doesn't disable the extension on update for existing users.*
- WXT/`storage.sync` isn't a usable backup: it's capped at about 100 KB in total and 8 KB per item in Chrome and Firefox (https://developer.chrome.com/docs/extensions/reference/api/storage#property-sync, https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/sync). It stays settings-only.
- What wipes tier-1 data (inference, check against browser docs): uninstalling the extension, "clear extension data", and a profile reset. Normal "clear browsing data" is *believed* to leave extension storage alone. PR E shows a "Not backed up: install the daemon or export" hint while the sync state is never-paired.

## 2. Verified current state (code read 2026-10-04)

### 2.1 Defects found
1. **The daemon ignores every extension sync op.** In `natmsg/host.go:103`, `TypeOp`/`TypeOpResult` go to `hub.Deliver`, which drops anything except replies to daemon-initiated requests. No Go code handles `stash_sync_seed`, `stash_sync_change` or `stash_sync_ping`.
2. **The extension marks a working daemon `offline`.** Its health probe is `op{tool:"stash_sync_ping"}` (`sync-client.ts` `ping()`), which never gets a reply, so the extension flips to `offline` after `OP_TIMEOUT_MS` even while connected. *Inference: this probably explains the "offline" states seen during testing.*
3. **The daemon never pushes changes to the extension.** The extension's W3 `materialize` path exists, but nothing on the daemon side sends to it.
4. **Two write pipelines that disagree.** `crdt.Sync` (Automerge) has **no production caller**: `grep NewSync|MergeHead|LoadDocHead` outside `internal/crdt` is empty. MCP writes call `store.PutRecord(rec, []byte(items), …)`, which writes the **items JSON into `crdt_doc.blob`**, overwriting whatever was there. `doctor`'s `checkCRDTBinding` writes 16 random bytes there too.
5. **The schema drops fields.** `stash_records` has no `tags`, `note`, `kept` or structured `shares`. `stash_create`/`stash_update` advertise tags and note but ignore them. `summaries()`/`stashJSON()` hard-code `tags: []` and `note: ""`. `stash_search` claims to match tags and note but only matches title and url.
6. **Mixed time units.** `store.DeleteRecord` sets `updated_at = time.Now().Unix()` (seconds). Everything else uses milliseconds (`nowMillis()`, extension `Date.now()`).
7. **`outbox` table grows forever.** Every write appends a row, and nothing reads or deletes them except `OutboxDepth()`, which reports the count in `status`.
8. **Peer identity is the browser name.** `peerID = hello.extension.name` ("Chrome"/"Firefox"), so two Chrome profiles collide in the hub. The real profile identity is `origin` (the extension's `profileId`), carried in every seed and change.
9. **The extension's `materialize` overwrites blindly**, with no LWW check against the local `updatedAt`.

### 2.2 Wire contract (already implemented by the extension; the daemon must match it)
- **Frames.** NDJSON `Envelope{type, correlationId, payload}` (`natmsg/frame.go`). `op.payload = {tool, args}`, `opResult.payload = {result}`, `error.payload = {code, message}`.
- **Extension → daemon ops.** The extension awaits a reply with the **same `correlationId`**: `opResult` means ok, `error` or timeout means NACK.
  - `stash_sync_seed`: `args = SeedPayload{records: StashRecord[], origin}`. Sent after **every** pairing, because `seedDone` is in-memory and resets on every SW wake.
  - `stash_sync_change`: `args = ChangeRecord{op: "create"|"update"|"delete", id, record?, updatedAt, origin}`. The outbox drains in order and **stops at the first NACK**, so a permanently NACKed change wedges it.
  - `stash_sync_ping`: `args = {}`. The extension accepts either `opResult` or an `op{tool:"stash_sync_pong"}` with the same `correlationId`.
- **Daemon → extension push.** `op{tool:"stash_sync_change", args: ChangeRecord}`, using a daemon-minted `correlationId` (`MintCorrelationID("daemon")`). The extension acks with a **freshly minted** `opResult{result:{ack: <push correlationId>}}`. That ack does *not* echo the push's correlationId, so the daemon has to correlate on `result.ack`.
- **`StashRecord` JSON (extension).**
  - Fields: `{id, title?, tags: string[], note?, items: {url,title}[], shares?: ShareEvent[], kept?: boolean, createdAt, updatedAt}`.
  - `ShareEvent = {url, shortUrl?, itemCount, truncated, createdAt, expiresAt}`.
  - A missing `kept` means kept.

## 3. PR D — daemon becomes the store

### 3.1 Decision: record-level LWW in SQLite; Automerge is not on the sync path
The extension speaks whole-record LWW (`ChangeRecord`), not Automerge, and the Automerge pipeline has no production caller (§2.1.4). So PR D makes **`stash_records` the canonical store**:
- Record-level last-write-wins on `updatedAt` (ms).
- Soft-delete **tombstones** (`deleted = 1`, `updated_at` = delete time).
- A monotonic **`rev`** change feed.

This **deviates from spec §6.6/§6.7** (Automerge, hard delete with no tombstones). Tombstones are needed because every pairing re-seeds the full library. Without them, a stale profile would bring back records deleted elsewhere (by an agent or another profile). Add a short "Deviation" note to spec §6 in this PR. Leave `internal/crdt` in place and unused; whether to remove it or adopt it for tier 3 is a separate issue.

### 3.2 Migration `daemon/internal/store/migrations/0002_full_record.sql` (+ `.down.sql`)
```sql
ALTER TABLE stash_records ADD COLUMN tags_json   TEXT NOT NULL DEFAULT '[]';
ALTER TABLE stash_records ADD COLUMN note        TEXT;
ALTER TABLE stash_records ADD COLUMN kept        INTEGER NOT NULL DEFAULT 1;
ALTER TABLE stash_records ADD COLUMN shares_json TEXT NOT NULL DEFAULT '[]';
-- unknown optional StashRecord fields round-trip untouched (forward compat)
ALTER TABLE stash_records ADD COLUMN extra_json  TEXT NOT NULL DEFAULT '{}';
ALTER TABLE stash_records ADD COLUMN rev         INTEGER NOT NULL DEFAULT 0;
-- §2.1.6: seconds → ms for soft-deleted rows written by DeleteRecord
UPDATE stash_records SET updated_at = updated_at * 1000 WHERE updated_at < 100000000000;
UPDATE stash_records SET rev = rowid;
DELETE FROM stash_records WHERE id = '__doctor_probe__';
DELETE FROM outbox;      -- §2.1.7 legacy rows hold items JSON, never consumed
DELETE FROM crdt_doc;    -- §2.1.4 holds items JSON / doctor bytes, not a doc
CREATE INDEX idx_stash_records_rev ON stash_records(rev);
```
The down migration drops the index. SQLite ≥3.35 supports `DROP COLUMN`, so it drops the six columns too (the bundled modernc build supports it; verify in the test).

### 3.3 Store API (`daemon/internal/store/store.go`)
- Extend `Record` with `TagsJSON string`, `Note sql.NullString`, `Kept bool`, `SharesJSON string`, `ExtraJSON string`, `Rev int64`. Every `SELECT` and `scanRecords` reads the new columns.
- **Cross-process write safety.** `serve` and `host` are separate processes on one DB file, and `Store.mu` only serializes writers within one process. Change the DSN to add `&_txlock=immediate` (supported by `modernc.org/sqlite` v1.34.4, `sqlite.go:927`) so every `Begin()` takes the write lock up front. `busy_timeout(5000)` is already set. `rev` is assigned inside the transaction as `(SELECT COALESCE(MAX(rev),0)+1 FROM stash_records)`, and the immediate lock keeps it unique across processes.
- New API (replace `PutRecord`/`DeleteRecord` call sites; delete them once unused):
```go
type Change struct {
    Op        string  // "create" | "update" | "delete"
    ID        string
    Record    *Record // nil for delete
    UpdatedAt int64   // ms
    Origin    string  // profileId, or "daemon" for MCP writes
}

// ApplyChange applies c under record-level LWW; applied=false means c was stale (not an error).
func (s *Store) ApplyChange(c Change) (applied bool, err error)

// ChangesSince returns rows (live and tombstones) with rev > since, ascending by rev.
func (s *Store) ChangesSince(since int64, limit int) ([]Record, error)

func (s *Store) LiveCount() (int, error)
```
- **LWW rules** (`existing` = the current row, including tombstones):
  - No row: apply. A delete of an unknown id inserts a tombstone, so a later stale seed can't create the record.
  - Upsert vs live row: apply iff `c.UpdatedAt > existing.updated_at`, or the timestamps are equal and `c.Origin > existing.origin` (deterministic tie-break).
  - Upsert vs tombstone: apply iff `c.UpdatedAt > tombstone.updated_at`, i.e. an edit made strictly after the delete brings the record back.
  - Delete vs live row: apply iff `c.UpdatedAt >= existing.updated_at`. Delete wins ties (spec §6.7 intent).
  - Every applied change sets `rev = MAX(rev)+1` and `origin = c.Origin`.
- **Record ↔ JSON** (new `store/recordjson.go`): `func RecordFromJSON(raw json.RawMessage) (Record, error)` and `func (r Record) ToJSON() json.RawMessage`.
  - Known keys map to columns; `title` absent ↔ `""`; `kept` absent ↔ `true`.
  - Unknown keys are kept in `extra_json` and merged back on output.
  - `url` = first item URL (as `firstURL` today).
  - Validation: `id` non-empty, `items` an array, `createdAt`/`updatedAt` numbers. Invalid → error.
- `SearchRecords` also matches `tags_json` and `note` (as `stash_search` already advertises).
- Drop the `outbox` and `crdt_doc` writes from the store write path.

### 3.4 MCP (`daemon/internal/mcpserver/server.go`, `tools.go`)
- `stash_create`: honours `tags` and `note`, and accepts an optional `kept` (default `true`, since an agent asked to save it). Writes through `ApplyChange{Op:"create", Origin:"daemon"}`.
- `stash_update`: honours `title`/`tags`/`note`/`items`/`kept`, then `ApplyChange{Op:"update"}`.
- `stash_delete`: `ApplyChange{Op:"delete", UpdatedAt: nowMillis()}`. It returns `not_found` when no live row exists.
- `Summary` gains `Kept bool` (`json:"kept"`). `stashJSON` emits real `tags`, `note`, `kept` and `shares`.
- Update the `tools.go` schemas (`kept` on create and update) and the checked-in `testdata/extension_tools_snapshot.json`, keeping it in parity with the extension MCP table from #66.

### 3.5 Host sync (`daemon/internal/natmsg/sync.go`, new; wired in `host.go`)
Route `TypeOp` frames from the browser to `handleSyncOp`. `TypeOpResult`/`TypeError` first go to the push tracker (match on `result.ack`), and only then fall back to `hub.Deliver`, unchanged for `stash_snapshot_tabs`.

**`handleSyncOp(env)`.** Every reply uses the **same `correlationId`**.

| tool | action | reply |
|---|---|---|
| `stash_sync_ping` | none | `op{tool:"stash_sync_pong", args:{}}` |
| `stash_sync_seed` | For each record, `ApplyChange{Op:"update"}` with LWW. Set `conn.origin = args.origin`. Then start or kick the push loop (below), noting `seedWasEmpty = len(records)==0`. | `opResult{result:{applied, stale, invalid}}` |
| `stash_sync_change` | `RecordFromJSON` + `ApplyChange` | `opResult{result:{applied: bool}}`. **Stale and invalid changes are still acked** (`applied:false`, invalid ones logged) so the extension outbox can't wedge (§2.2). |
| other | | `error{code:"unknown_tool"}` |

**Push loop** (one goroutine per host connection; starts after the first seed; stops on disconnect):
- **Cursor.** `sync_state(peer_id = origin).last_sent_seq`, stored as the last pushed `rev`.
- **Restore mode** applies when (a) there's no `sync_state` row for this origin (new or wiped profile, since a wipe regenerates `profileId`), or (b) `seedWasEmpty && LiveCount() > 0` (partial wipe that kept the `profileId`). It starts the cursor at `0` and sends **every row, including own-origin rows, skipping tombstones**.
- **Steady state.** Each tick (1 s, plus an immediate kick after every applied incoming change), `ChangesSince(cursor, 200)`. Skip rows whose `origin == conn.origin` (echo suppression). Send each remaining row as `op{tool:"stash_sync_change", args:{op: deleted ? "delete" : "update", id, record: deleted ? omitted : row.ToJSON(), updatedAt, origin: row.origin}}`.
- **Delivery.** Send one at a time and await the `result.ack` (5 s, same budget as `SnapshotTimeout`). On ack, advance the cursor and `UpsertSyncState`, also setting `last_sync_at`. On timeout or disconnect, stop this pass and retry on the next tick.
- **Writer safety.** Push frames go through the existing `lockedWriter`.
- **Hub.** Keep using `peerID = hello.extension.name` for `stash_snapshot_tabs` routing. Fixing that (§2.1.8) is out of scope for PR D; mention it in the PR body.

### 3.6 Extension (small, same PR)
- `sync-client.ts` `materialize()`: apply LWW against the local record. Skip an upsert or delete when `local.updatedAt > change.updatedAt`. Still ack every push, so the daemon cursor advances.
- `wxt.config.ts`: add `"unlimitedStorage"` (§1.1).
- No protocol version bump. All new behaviour uses tools and shapes the extension already speaks.

### 3.7 Doctor / status
- Replace `checkCRDTBinding` with **`store write`**: begin a transaction, insert a probe row, read it back, **roll back**, then report Pass/Fail. Rename the check to `store write`; update the doctor tests and any `--json` golden files.
- `status`: drop `OutboxDepth`, and the `outbox` table writes along with it. Report a per-peer `lag = MAX(rev) - last_sent_seq` and `last_sync_at` from `sync_state`. Keep the JSON key `outboxDepth` as the sum of the lags so existing consumers don't break.

### 3.8 Tests (all must pass: `go test -race ./...` in `daemon/`, extension vitest, `pnpm run validate`, `pnpm run build`)
- **Store**:
  - Migration up/down on a v1 DB with legacy rows (seconds→ms fix, probe removed, `kept=1` default).
  - The full LWW matrix in §3.3, including the tie-break and tombstone cases.
  - `rev` monotonic and unique with **two `Store` handles on one file** writing concurrently from two goroutines (stands in for the two processes).
  - JSON round-trip that keeps unknown fields.
- **Host** (`natmsg`, using the in-memory pipe pattern from `TestHandshakeAndMCPRouting`):
  - Ping → pong with the same correlationId.
  - Seed is idempotent, and stale seed records don't overwrite newer rows.
  - A seed can't bring back a tombstoned id.
  - A change is acked when applied, stale, and invalid.
  - Push: agent-style `ApplyChange` on a second `Store` handle → the host pushes it within 2 ticks → ack advances `sync_state`.
  - Echo suppression for own-origin rows.
  - **Restore**: new origin plus non-empty daemon → all live rows pushed; empty seed with a known origin → all live rows pushed.
  - Disconnect mid-push → no cursor advance.
- **Conformance fixtures** under `natmsg/testdata/` (`sync_seed.json`, `sync_change.json`, `sync_push.json`, `sync_push_ack.json`, `sync_ping.json`), consumed by the Go conformance test **and** a new extension vitest that loads them by relative path (`daemon/internal/natmsg/testdata/`) and runs them through `parseFrame` + the `SyncClient` handlers. Today the extension doesn't read these fixtures, so this test is new.
- **MCP**: create, update and get round-trip tags/note/kept; search by tag and by note; snapshot parity.
- **Extension**: `materialize` LWW skip/apply for upsert and delete, and a push ack is sent even when skipped.
- **E2E**: native messaging can't be spawned in this VM's Chrome for Testing, so daemon⇄extension coverage lives in the Go tests above. Re-run `packages/e2e` (`pnpm --filter @stash/e2e run test`) to confirm nothing regressed.

### 3.9 Docs
- Spec §6: add the Deviation note (§3.1).
- `daemon/README` and `docs`: sync is now bidirectional, and the daemon restores wiped profiles.
- `.agents/notes/<date>-daemon-lww-store.md`: the learning note.
- Changeset: `stash-daemon` minor, extension patch.

### 3.10 Out of scope for PR D
- Hub peer identity (§2.1.8).
- Removing or adopting `internal/crdt`.
- Tombstone compaction: tombstones are tiny, so keep them; revisit if a library exceeds 10k rows.
- Cross-machine sync.
- Viewer reading from the daemon.

## 4. PR E — extension Library page; the popup only collects (design level)
1. **New WXT unlisted page `entrypoints/library/`**, opened as `chrome-extension://…/library.html`, like OneTab.
   - The full Library: All / Kept / Recent, search, edit title/tags/note, open all, share and QR, import/export, and sync status.
   - Settings move in from `options/`, and `options_ui` points to the same page.
2. **Popup** = collection: pick tabs → Save / Share, the Keep-in-Library result, and an "Open Library" button. The popup `StashesView` is removed once the page lands.
3. **UI reuse.** Use the extension's own CSS and Lucide, widened popup components (`StashItem`, `LinkResult`), and the helpers in `@stash/shared`. No Tailwind port. Extract a shared component only when it's actually duplicated.
4. **Viewer `/stashes`.**
   - Stays the library for users without the extension and keeps the agent DOM contract (spec §2.5 and §10.1).
   - When the extension is present, it shows an "Open your Library in the extension" CTA. The content script answers a **presence** ping that carries no data, regardless of the bridge setting.
   - The two-section view from #66 becomes the read-only mirror.
5. **Viewer → extension handoff** (one-time):
   - The viewer sends its `localStorage` records over the bridge as `stash:viewer:handoff`, validated by `toStashExport`.
   - The content script stores them under `pending-import` and opens the Library page, where the user confirms the import.
   - On success the viewer clears the imported records.
   - This is the only write into the extension, and it needs an explicit confirmation in the extension.
6. **No-daemon hint.** While never-paired: "Not backed up: install the daemon or export" (§1.1).

## 5. Effect on other work
- #64: the landing and `/s/` header work is unchanged. The popup Tabs/Library tabs idea is dropped.
- #66: unchanged. Recent/Kept and `kept` flow into the daemon through §3.3.

## 6. Refined-task fields
| Work | Class | Effort | Order |
|---|---|---|---|
| PR D daemon store + bidirectional sync + fallback hardening | bug | L | 1 |
| PR E Library page + popup collection-only | feature | L | 2 |
| PR E viewer handoff + presence ping | feature | M | 2 |
These still need GitHub issues: issues can't be created from this VM, so add them manually or provide a token.

## 7. Adversarial notes
- **"Keep Automerge, it's in the spec."** The extension has no Automerge, and the daemon's Automerge path has no production caller. Adopting it means rewriting the extension's sync to Automerge, which is XL. LWW plus tombstones is enough for one user across a few profiles (spec tier 3 intent). Revisit if real concurrent field-level edits show up.
- **"The viewer should read the daemon directly."** The public origin can't reach loopback without a new HTTP API and CORS/PNA exposure, which spec §4.5 forbids. Rejected.
- **"Use `storage.sync` as the fallback backup."** The 100 KB quota rules it out.
- **Full re-seed on every SW wake** costs O(library) per pairing. It's acceptable at the 1000-record cap (`MAX_STASHES`). Persisting `seedDone` per daemon is a later optimisation.
- **Clock skew.** LWW trusts the client clocks, and profiles on one machine share a clock, so this is fine for tier 2/3. Cross-machine sync would need HLCs.
