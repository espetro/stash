# @stash/extension

## 0.10.2

### Patch Changes

- @stash/codec@0.10.2
- @stash/theme@0.10.2
- @stash/shared@0.10.2
- @stash/server-core@0.3.2

## 0.10.1

### Patch Changes

- dcad132: fix(daemon,extension): make Chrome native-messaging pairing actually work
  - daemon: detect the `chrome-extension://<id>/` spawn argument before flag
    parsing — Chrome always launches the host with the origin as argv, and the
    previous dispatch exited `unknown command` on every real spawn.
  - daemon: natmsg codec now speaks the Chrome NM wire format (4-byte
    little-endian length prefix + JSON) instead of newline-delimited JSON.
  - extension: `postMessage` the frame object instead of its JSON string —
    Chrome delivers strings verbatim to the host, so the daemon saw a string
    where it expected an envelope.
  - @stash/codec@0.10.1
  - @stash/theme@0.10.1
  - @stash/shared@0.10.1
  - @stash/server-core@0.3.1

## 0.10.0

### Minor Changes

- ffe25f4: Move the Library out of the popup into a dedicated `library.html` page.
  The popup is now collection-only (Share / Save locally) with an "Open
  Library" button; the new page hosts the full library — All/Kept/Recent,
  search, inline editing, per-row Share + QR + Open-all, import/export —
  plus a `#settings` tab carrying the old options page (`options_ui` now
  points there). `/stashes` detects the extension via an always-on
  presence ping and offers "Open your Library in the extension" plus a
  one-time handoff that parks viewer-local records for a user-confirmed
  import; while never paired, the page shows a "Not backed up: install
  daemon or export" hint. The data bridge keeps its `localLibraryViewerEnabled`
  gate — presence, open, and handoff work regardless.
- 401e0ea: feat(extension,viewer): zero-trust client flip — the extension's "Shorten link" and the viewer's own short-link creation now encrypt the payload client-side (AES-256-GCM, per-share 128-bit key) and upload only ciphertext; share URLs carry the key in `#<key>` (never sent to any server). The viewer decrypts relayed `/s?id=<id>&relay=<origin>#<key>` links locally — fetching the ciphertext envelope from the minting relay (`&relay=`, http(s) origins only) — fails closed on missing key, tampered ciphertext, or expired entries. Failures fall back silently to self-contained `#p=` links.
- 7007184: Add a profile-local browser-agent surface at `https://stash.illo.fyi/stashes`. When the new `localLibraryViewerEnabled` setting is on, a content-script bridge (`stashes-bridge.content.ts`) reads the user's extension stash library in memory and exposes it through a deterministic JSON island and `?agent=json|markdown` browser-only views for browser-class agents (ChromeClaw, NanoBrowser, BrowserOS). Fetch-only agents must continue using `/s?p=<payload>&format=json`.
  - `@stash/shared`: new `agent-export` subpath exporting `StashExport`, `toStashExport`, `isStashExport`, `MAX_STASHES`.
  - Extension: new `localLibraryViewerEnabled` opt-in setting (default `false`, lives in `browser.storage.sync`), a `defineContentScript` postMessage bridge gated on the setting with origin / source / schema / replay / size validation, and an `OptionsLocalLibraryForm` disclosing the sync-roaming flag and metadata exposure.
  - Viewer: `MyStashes` probes the bridge on mount, falls back to viewer `localStorage` when the bridge is unavailable, shows a source chip and read-only hint, hides edit/delete/import/export for the extension source, filters non-`http(s)` URLs, and renders the canonical `StashExport` JSON island (`#stash-local-export`, `data-stash-status="loading"→"ready"`) plus stable `[data-stash-*]` semantic selectors. New `?agent=json` and `?agent=markdown` browser-only client-rendered views.
  - OpenAPI / `llms.txt`: description notes calling out the new `/stashes` profile-local surface for browser agents; no `/stashes` path entry added (it is not a fetch endpoint).
  - E2E: new `packages/e2e/specs/local-bridge.spec` covering bridge-enabled surface, bridge-disabled fallback, no-persistence, and fetch-only baseline.

### Patch Changes

- 73d01c5: Make the daemon the durable stash store: `stash_records` now holds the full
  record shape (tags, note, kept, shares, unknown-field round-trip) behind a
  monotonic `rev` feed, and bidirectional extension sync applies record-level
  last-writer-wins with tombstones so deletes can't be resurrected by a stale
  re-seed. The daemon pushes changes it sees elsewhere back to the extension
  and restores the whole library into new or wiped profiles; the extension
  materializes pushes under the same LWW rule and gains `unlimitedStorage` so
  `storage.local` stays a viable fallback.
- Updated dependencies [e3a02fb]
- Updated dependencies [b635f89]
- Updated dependencies [5f44887]
- Updated dependencies [524f935]
- Updated dependencies [7007184]
  - @stash/shared@0.10.0
  - @stash/server-core@0.3.0
  - @stash/codec@0.10.0
  - @stash/theme@0.10.0

## 0.9.0

### Minor Changes

- 1f1b91f: Add a "Try MCP" panel to the extension options page. Connects to the background MCP server, lists tools, lets the user call one and see the response. Dogfoods the previously unused `connectToBackgroundMcp()`.
- 63174e5: Tighten externally_connectable: drop `ids: ["*"]` (any extension), allowlist MCP-B's production id, add localhost for the local relay. Validate port.sender in the background handler.

### Patch Changes

- 7224704: New `@stash/mcp-relay` package bridging stdio agents (Claude Desktop, Cursor) to the extension's local MCP server. Extension manifest now allows localhost matches for the relay to attach.
- 8d314f9: Align MCP port name across code and docs to "mcp" (was "stash-mcp" in docs). Adds regression test.
- c936f09: Fix MCP self-connect blocker: allow runtime ports whose sender id equals the extension's own `browser.runtime.id` (popup/options pages), while still rejecting foreign ids spoofing a `chrome-extension://` URL.
- Updated dependencies [8d72ba5]
- Updated dependencies [7f99ed4]
- Updated dependencies [2443a0b]
- Updated dependencies [a7c69d4]
  - @stash/server-core@0.2.0
  - @stash/shared@0.9.0
  - @stash/codec@0.9.0
  - @stash/theme@0.9.0

## 0.8.1

### Patch Changes

- @stash/codec@0.8.1
- @stash/theme@0.8.1
- @stash/shared@0.8.1
- @stash/server-core@0.1.4

## 0.8.0

### Minor Changes

- 433b330: Payload schema v6: optional top-level tags and note. Decoder accepts v4/v5/v6; v4/v5 stay decode-only legacy. Adds local stash library, My Stashes UI, MCP tool set, opt-in short links, and telemetry.
- 64603e9: UX cleanup for popup and viewer: shorten-on-demand with link type hints, save-stash form (title, tags, note), header back navigation, grouped copy actions, viewer app header nav, stacked primary actions to prevent overflow.

### Patch Changes

- Updated dependencies [433b330]
  - @stash/codec@0.8.0
  - @stash/server-core@0.1.3
  - @stash/shared@0.8.0
  - @stash/theme@0.8.0

## 0.7.1

### Patch Changes

- 340ce40: Narrow host access to the viewer origin (content scripts, externally_connectable, web-accessible fonts) to pass store review, raise Firefox strict_min_version to 140, and complete the AMO sources archive with first-party workspace packages.

  ***

  ## stash-viewer: patch

  Update privacy policy to disclose short-link KV storage and website analytics.
  - @stash/codec@0.7.1
  - @stash/theme@0.7.1
  - @stash/shared@0.7.1
  - @stash/server-core@0.1.2

## 0.7.0

### Minor Changes

- 551bcb0: Experimental in-extension agent server via `@stash/server-core`: the extension background can host the stash server + MCP bridge locally. The shortener worker is now a thin adapter over the same runtime-agnostic server package, with per-IP rate limiting (RL_STASH/RL_MCP, fail-open) ported into server-core.

### Patch Changes

- @stash/codec@0.7.0
- @stash/theme@0.7.0
- @stash/shared@0.7.0
- @stash/server-core@0.1.1

## 0.6.0

### Minor Changes

- cb1a180: Add /s/new page for on-the-fly stash creation and fix codec URL encoding

### Patch Changes

- Fix GitHub Release workflow to use exact file paths instead of globs for extension artifact uploads
- Updated dependencies
- Updated dependencies [cb1a180]
  - @stash/codec@0.6.0
  - @stash/theme@0.6.0
  - @stash/shared@0.6.0
