# PR E — extension Library page; popup collects only

Implements §4 of `2026-10-04-daemon-store-extension-library.md` (design-level spec).
Branch: `devin/<ts>-extension-library-page` off `develop` (post-#67).

## Scope

### 1. New unlisted page `entrypoints/library/` (`library.html`)
- One app, two tabs: **Library** (default) and **Settings** (`#settings` hash; `options_ui.page` → `library.html`, `open_in_tab: true`).
- Library tab = the `StashesView` surface, moved and widened:
  - All / Kept / Recent filters, search (title/tag/note), per-row edit title/tags/note, delete (2-click confirm), Keep for Recent, Share (copy link) + **QR** dialog (`lean-qr`, already a dep — copy the viewer `QrDialog` pattern), **Open all** (open all items as background tabs), shares sub-list.
  - Header actions: Import (JSON file), Export (JSON download).
  - `SyncStatusBar` (moved) + **backup hint** while `state === "disconnected"` (never-paired): "Not backed up: install the daemon or export your library" (§1.1) — link to install docs (`https://stash.illo.fyi/docs/…` if one exists, else the GitHub daemon README) + one-click Export.
  - `PendingImportBanner`: reads `pending-import` from `storage.local`; "Import N stashes from the Stash website?" → confirm → `importStashes` + clear key + toast; dismiss → clear key.
- Settings tab = the options forms, moved verbatim (`OptionsExpiryForm`, `OptionsThemeForm`, `OptionsViewerForm`, `OptionsShortenerForm`, `OptionsLocalLibraryForm`, `OptionsTelemetryForm`, `TryMcpPanel`, `OptionsFooter`) → `entrypoints/library/components/settings/`. `entrypoints/options/` is deleted.

### 2. Popup = collection only
- `StashesView`/`StashItem`/`SyncStatusBar` move to `components/library/`; popup keeps: tab selection, Share tabs, Save locally (`SaveStashForm`), `LinkResult` (Keep action stays), `ErrorMessage` (moved to `components/` root — also used by library).
- Header: archive button → "Open Library" → `browser.tabs.create({url: browser.runtime.getURL("/library.html")})`; gear → `browser.runtime.openOptionsPage()` (opens library.html).
- Hooks `useStashes`, `useSyncStatus` move to `entrypoints/library/hooks/` (only library uses them post-slim).
- Popup keeps `SyncStatusBar`? No — collection-only; daemon status surfaces on the Library page.

### 3. Content script (`stashes-bridge.content.ts`)
Listener attaches **unconditionally** now; gating is per message type:
- `stash:viewer:presence` → always `{status:"ok"}`, no data (regardless of `localLibraryViewerEnabled`).
- `stash:viewer:request` (library data) → still gated: disabled → `{status:"error", error:"bridge_disabled"}` (fast fail, no timeout).
- `stash:viewer:open` → relay `browser.runtime.sendMessage({type:"stash:open-library"})` → ack.
- `stash:viewer:handoff` → `isStashExport(payload)` + `source==="viewer-local"` + `stashes.length ≤ MAX_STASHES` → sendMessage `{type:"stash:handoff", payload}` → ack `{ok:true}` after background stores + opens library.
Replay-protection + requestId echo rules unchanged.

### 4. Background
- `stash:open-library` → `browser.tabs.create(library.html)`.
- `stash:handoff` → validate again (defense in depth) → `storage.local["pending-import"] = {records, receivedAt, source}` → open `library.html#pending-import` → return `{ok:true}`.

### 5. Viewer `/stashes` (MyStashes.tsx + local-bridge.ts)
- `probeExtensionPresence()` — light `stash:viewer:presence` probe (same envelope discipline), independent of the data probe.
- Extension present → CTA "Open your Library in the extension" → `stash:viewer:open`. Shown regardless of bridge opt-in.
- Handoff CTA when `present && viewerRecords.length > 0`: "Move N viewer stashes into the extension" → sends `stash:viewer:handoff` with `toStashExport(records,"viewer-local")` → on `{ok}` clear viewer records (`useStashLibrary` gains `clearAll`) + show moved note.
- `data-stash-*` DOM contract unchanged (e2e asserts it). Two-section extension mirror stays read-only.
- i18n keys added for both languages (check `src/i18n` structure).

### 6. CSS
- `entrypoints/library/style.css`: import/reuse popup styles (`@import "../popup/style.css"` or duplicate the needed rules — check Vite handling) + page-layout rules (`.library-container` max-width ~960px, toolbar, tabs, banner, settings sections).

### 7. Screens registry + docs
- `screen-extension-*.md`: popup loses Library; new `screen-extension-library.md` for the page (both tabs + pending-import banner + backup hint).
- `screen-viewer-*.md` for `/stashes`: CTA + handoff rows.

### 8. Tests
- `stashes-bridge.test.ts`: presence always-answered; request gated (`bridge_disabled`); open relay; handoff accept/reject shapes.
- New `pending-import` lib test (background handoff path — storage write + message shape).
- Move `StashesView.test.tsx`/`StashItem.test.tsx` with the components; adjust imports.
- Library page render test (jsdom): filters, backup hint in disconnected state, pending-import banner.
- Keep `pnpm --filter @stash/extension run test` green + `pnpm run validate` + `pnpm run build`; e2e `local-bridge.spec` unchanged behavior (presence doesn't alter contract) — re-run `pnpm --filter @stash/e2e run test`.

### 9. Changeset
- `@stash/extension` minor (Library page, popup slim, options relocation), `stash-viewer` patch (presence CTA + handoff).

## Explicitly NOT in scope
- Cross-machine sync, HLC clocks.
- Viewer reading the daemon.
- Library page virtualization (cap is 1000 records; DOM list is fine).
- Agent JSON endpoints on `/stashes` — unchanged.
