# @stash/theme

## 0.10.2

## 0.10.1

## 0.10.0

### Minor Changes

- 7007184: Add a profile-local browser-agent surface at `https://stash.illo.fyi/stashes`. When the new `localLibraryViewerEnabled` setting is on, a content-script bridge (`stashes-bridge.content.ts`) reads the user's extension stash library in memory and exposes it through a deterministic JSON island and `?agent=json|markdown` browser-only views for browser-class agents (ChromeClaw, NanoBrowser, BrowserOS). Fetch-only agents must continue using `/s?p=<payload>&format=json`.
  - `@stash/shared`: new `agent-export` subpath exporting `StashExport`, `toStashExport`, `isStashExport`, `MAX_STASHES`.
  - Extension: new `localLibraryViewerEnabled` opt-in setting (default `false`, lives in `browser.storage.sync`), a `defineContentScript` postMessage bridge gated on the setting with origin / source / schema / replay / size validation, and an `OptionsLocalLibraryForm` disclosing the sync-roaming flag and metadata exposure.
  - Viewer: `MyStashes` probes the bridge on mount, falls back to viewer `localStorage` when the bridge is unavailable, shows a source chip and read-only hint, hides edit/delete/import/export for the extension source, filters non-`http(s)` URLs, and renders the canonical `StashExport` JSON island (`#stash-local-export`, `data-stash-status="loading"→"ready"`) plus stable `[data-stash-*]` semantic selectors. New `?agent=json` and `?agent=markdown` browser-only client-rendered views.
  - OpenAPI / `llms.txt`: description notes calling out the new `/stashes` profile-local surface for browser agents; no `/stashes` path entry added (it is not a fetch endpoint).
  - E2E: new `packages/e2e/specs/local-bridge.spec` covering bridge-enabled surface, bridge-disabled fallback, no-persistence, and fetch-only baseline.

## 0.9.0

## 0.8.1

## 0.8.0

## 0.7.1

## 0.7.0

## 0.6.0

### Minor Changes

- cb1a180: Add /s/new page for on-the-fly stash creation and fix codec URL encoding

### Patch Changes

- Fix GitHub Release workflow to use exact file paths instead of globs for extension artifact uploads
