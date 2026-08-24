---
"@stash/extension": minor
"stash-viewer": minor
"@stash/codec": minor
"@stash/theme": minor
"@stash/e2e": minor
"@stash/shared": minor
---

Add a profile-local browser-agent surface at `https://stash.illo.fyi/stashes`. When the new `localLibraryViewerEnabled` setting is on, a content-script bridge (`stashes-bridge.content.ts`) reads the user's extension stash library in memory and exposes it through a deterministic JSON island and `?agent=json|markdown` browser-only views for browser-class agents (ChromeClaw, NanoBrowser, BrowserOS). Fetch-only agents must continue using `/s?p=<payload>&format=json`.

- `@stash/shared`: new `agent-export` subpath exporting `StashExport`, `toStashExport`, `isStashExport`, `MAX_STASHES`.
- Extension: new `localLibraryViewerEnabled` opt-in setting (default `false`, lives in `browser.storage.sync`), a `defineContentScript` postMessage bridge gated on the setting with origin / source / schema / replay / size validation, and an `OptionsLocalLibraryForm` disclosing the sync-roaming flag and metadata exposure.
- Viewer: `MyStashes` probes the bridge on mount, falls back to viewer `localStorage` when the bridge is unavailable, shows a source chip and read-only hint, hides edit/delete/import/export for the extension source, filters non-`http(s)` URLs, and renders the canonical `StashExport` JSON island (`#stash-local-export`, `data-stash-status="loading"→"ready"`) plus stable `[data-stash-*]` semantic selectors. New `?agent=json` and `?agent=markdown` browser-only client-rendered views.
- OpenAPI / `llms.txt`: description notes calling out the new `/stashes` profile-local surface for browser agents; no `/stashes` path entry added (it is not a fetch endpoint).
- E2E: new `packages/e2e/specs/local-bridge.spec` covering bridge-enabled surface, bridge-disabled fallback, no-persistence, and fetch-only baseline.
