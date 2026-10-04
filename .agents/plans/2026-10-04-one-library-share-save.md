# PR B: One Library, share = save (2026-10-04)

Task: #63 (v0.10.0, effort L, 2026-10-05 → 2026-10-09, feature). Decision: Option A from the
2026-10-04 UX assessment. Every share lands in the Library as **Recent** until its last link
expires; one click **Keeps** it. Builds on PR A (#65) because both touch `stash-store.ts`.
Branch from `devin/1791108624-fixes-e2e-harness` and rebase onto develop once #65 merges.

## Verified current state (develop @ c083f5a + #65)

- Sharing from the popup (`App.tsx` `handleCreateLink`) writes `stash-history`, then appends a
  `ShareEvent` only to a record whose items match the shared URL set *exactly*. Shares that match
  nothing never reach the Library.
- Neither the popup nor the viewer can share a stash that's already saved. "Share from a stash"
  does not exist yet.
- The short URL from `LinkResult` → `onShortened` only goes into `copyUrl`. It is never
  persisted, so deleting a stash can't revoke its short link.
- `migrateHistoryToShares` (`history-merge.ts`) turns history entries that match no record into
  empty carrier records (`id: h<id>`, `items: []`). Users who already ran it have
  "Untitled stash · 0 items" rows.
- Daemon gap, found by reading the code (not fixed here): the daemon has no handler for the
  extension's `stash_sync_change` / `stash_sync_seed` op frames. In `natmsg/host.go`, `TypeOp`
  frames go to `hub.Deliver`, which only correlates replies to requests the daemon itself started.
  The daemon store is fed only by daemon MCP `stash_create`/`stash_update`, and its records
  drop tags/note (`stashJSON` hard-codes `tags: [], note: ""`). So `kept` cannot reach the daemon
  in this PR. Tracked as a separate follow-up issue.
- The viewer bridge (`stashes-bridge.content.ts`) is read-only by design ("No writes"). So
  "Move viewer stashes into the extension" needs a write protocol and stays out of scope; see
  Deferred.

## Data model

```ts
// apps/extension/lib/stash-store.ts
export interface ShareEvent {
  url: string;          // payload URL (#p=)
  shortUrl?: string;    // set when the user shortens; used for revocation
  itemCount: number;
  truncated: boolean;
  createdAt: number;
  expiresAt: number;
}
export interface StashRecord {
  // ...existing fields
  /** false = Recent (share-only). Missing = kept, so existing records keep working. */
  kept?: boolean;
}
export const isKept = (r: StashRecord) => r.kept !== false;
export const recentExpiresAt = (r: StashRecord) => Math.max(0, ...(r.shares ?? []).map((s) => s.expiresAt));
```

No codec or payload change (the payload stays at v6). `kept` travels inside the full record that
the outbox/sync already carries.

## Store API (`apps/extension/lib/stash-store.ts`)

- `createStash(input)` gains an optional `kept` (default `true`) and optional `shares`.
- `recordShare({ items, title?, sourceId?, share }): Promise<StashRecord>`
  - With `sourceId` and the record exists: append the share via `appendShareEvent(sourceId, share)`.
  - Otherwise: `createStash({ items, title, tags: [], kept: false, shares: [share] })`.
  - No URL-set matching anywhere. Delete the exact-match block in `App.tsx`.
- `keepStash(id)`: sets `kept: true` through `updateStash`, so it produces an outbox `update`.
- `attachShortUrl(id, payloadUrl, shortUrl)`: sets `shortUrl` on the share whose `url === payloadUrl`.
- `pruneExpiredRecent(now = Date.now())`: deletes every record with `kept === false` and
  `recentExpiresAt(r) <= now`, via `deleteStash` (so outbox, history cleanup and revocation all
  run). Returns the deleted ids.
- `deleteStash(id)`, on top of PR A's history cleanup: for each share with a `shortUrl`, send
  `DELETE {shortenerOrigin}/api/stash/{ID}` (helper `revokeShortLink(shortUrl)` in
  `lib/shortener.ts`). Fire-and-forget, failures swallowed. Only revoke when the short URL's
  origin equals the configured shortener origin.

## Popup flow

- `handleCreateLink`: still call `addToHistory` (downgrade window, unchanged), then
  `recordShare({ items: tabInfos, share })`. Keep the returned record id in state
  (`linkRecordId`).
- `LinkResult.onShortened(shortUrl)`: also call `attachShortUrl(linkRecordId, finalUrl, shortUrl)`.
- Under the link, add a **Keep in Library** button (Lucide `LuPin`). Clicking it calls
  `keepStash(linkRecordId)` and switches to "Kept ✓". Hint text: "Added to Library as Recent.
  It's removed when the link expires unless you keep it."
- Library view (`StashesView`): rename the visible title "My Stashes" → "Library". Add filter
  chips **All · Kept · Recent** (default All; counts in the chips).
- `StashItem`:
  - Recent rows show a "Recent · expires in X" badge (`formatRemainingTime`, or "link never
    expires" when `expiresAt` ≥ now + 50y) and a **Keep** button.
  - Every row gets a **Share** action that encodes its items with the current settings, copies
    the link, and calls `recordShare({ items, title, sourceId: stash.id, share })`, which appends.
  - Title fallback when `title` is empty: `${items[0].title || host} + N more`, or
    "Untitled stash" when there are no items.
- On popup open (`useStashes` initial load) and on background startup, run `pruneExpiredRecent()`.
  No `alarms` permission.

## Migration (`history-merge.ts`)

- `migrateHistoryToShares`: unmatched entries no longer become empty carriers. Decode
  `entry.url` with `decodeShareUrl(new URL(entry.url).hash, brotli)` from `@stash/codec` and create
  `{ id: "h"+entry.id, title: decoded.title, tags: decoded.tags ?? [], note: decoded.note,
  items: decoded items (url/title, skipping note-kind items), kept: false, shares: [event] }`.
  If decoding fails, keep the old empty-carrier behaviour.
- New one-shot `repairCarrierRecords()`, behind the marker `historyCarriersRepaired`, for users who
  already migrated: records with `items.length === 0 && shares.length > 0` get items/title
  decoded from `shares[0].url` and `kept: false`. Records it can't decode stay untouched.
- Matching an existing record stays as it is (share URL, then item URL).
- Both run where `migrateHistoryToShares` runs today, and both are idempotent.

## Export / agents / MCP

- `packages/shared/src/agent-export.ts`: add optional `kept?: boolean` to `StashExportRecord`
  and `StashRecordLike`. `toStashExport` emits `kept: r.kept !== false` (viewer-local records
  are always `true`). `isValidStashRecord` accepts a missing `kept` or a boolean one, and rejects
  anything else.
- `apps/extension/lib/stash-io.ts`: round-trip `kept` and `shares[].shortUrl`.
- Extension MCP (`lib/mcp/server.ts`):
  - `stash_list`/`stash_search` summaries include `kept`, `stash_get` includes `kept`, and
    `stash_update` accepts an optional `kept: boolean`.
  - Tool names stay frozen. Descriptions say that "Recent" stashes (`kept: false`) are
    auto-removed when their links expire.

## Viewer

- `MyStashes.tsx`: when the bridge returns extension records, also render viewer-local records:
  - Two sections: "From the extension" (read-only, Kept/Recent badges) and "Saved in this
    browser" (editable, existing behaviour).
  - With no bridge, it looks the same as today.
  - The visible JSON export for agents keeps its current contract (extension source when
    available). Add a viewer-local JSON island only if it costs less than about 20 lines;
    otherwise skip it.
- Copy keys go into the viewer i18n for en/es/fr/ru, the same set as the existing myStashes keys.

## Tests (narrow)

- `stash-store.test.ts`:
  - `recordShare` without `sourceId` creates `kept:false` and enqueues an outbox `create`;
    with `sourceId` it appends and doesn't create a new record.
  - `keepStash` sets kept and enqueues an `update`.
  - `pruneExpiredRecent` removes expired Recent records only (keeps expired kept records and
    unexpired Recent ones).
  - `deleteStash` revokes `shortUrl`s on the configured shortener origin only (mock `fetch`).
  - `attachShortUrl` sets it on the right share.
- `history-merge.test.ts`:
  - An unmatched entry with a real encoded payload gets decoded items and `kept:false`.
  - An undecodable entry falls back to a carrier.
  - `repairCarrierRecords` fills items once and the second run is a no-op.
- `agent-export` tests: `kept` round-trips; non-boolean is rejected; missing `kept` is accepted.
- Popup component tests (existing RTL setup):
  - Share → Keep button flips to Kept.
  - Filter chips filter.
  - StashItem Share appends (assert `recordShare` is called with `sourceId`).
- Viewer `MyStashes` test: bridge available plus viewer-local records → both sections render.
- E2E: add one scenario to the existing extension spec. Share 2 tabs → Library shows 1 Recent →
  Keep → it shows under Kept.

## Docs

- Update `.agents/docs/screens/` for the popup link result, the Library view (currently "My
  Stashes"), the StashItem row and viewer `/stashes`. Remove/retire the History screen entry if
  it's still listed in INDEX.md.

## Deferred (separate issues)

- Daemon ingest of extension sync ops, and daemon storage of tags/note/kept (see Verified state).
- "Move to extension" from the viewer (needs a write-capable bridge protocol; the bridge is
  read-only by design).
- Removing `stash-history` writes. Starts one release after this ships (the downgrade window
  hasn't started, since F8 hasn't been released).
- Popup Tabs | Library tab bar and header redesign (#64).
