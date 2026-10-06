# @stash/shared

## 0.10.3

### Patch Changes

- @stash/codec@0.10.3

## 0.10.2

### Patch Changes

- @stash/codec@0.10.2

## 0.10.1

### Patch Changes

- @stash/codec@0.10.1

## 0.10.0

### Minor Changes

- 5f44887: feat(shared): zero-trust relay crypto core — `generateShareKey`/`encryptForRelay`/`decryptFromRelay` (AES-256-GCM, per-share 128-bit key carried in the URL fragment). No behavior change; groundwork for encrypted short links.
- 7007184: Add a profile-local browser-agent surface at `https://stash.illo.fyi/stashes`. When the new `localLibraryViewerEnabled` setting is on, a content-script bridge (`stashes-bridge.content.ts`) reads the user's extension stash library in memory and exposes it through a deterministic JSON island and `?agent=json|markdown` browser-only views for browser-class agents (ChromeClaw, NanoBrowser, BrowserOS). Fetch-only agents must continue using `/s?p=<payload>&format=json`.
  - `@stash/shared`: new `agent-export` subpath exporting `StashExport`, `toStashExport`, `isStashExport`, `MAX_STASHES`.
  - Extension: new `localLibraryViewerEnabled` opt-in setting (default `false`, lives in `browser.storage.sync`), a `defineContentScript` postMessage bridge gated on the setting with origin / source / schema / replay / size validation, and an `OptionsLocalLibraryForm` disclosing the sync-roaming flag and metadata exposure.
  - Viewer: `MyStashes` probes the bridge on mount, falls back to viewer `localStorage` when the bridge is unavailable, shows a source chip and read-only hint, hides edit/delete/import/export for the extension source, filters non-`http(s)` URLs, and renders the canonical `StashExport` JSON island (`#stash-local-export`, `data-stash-status="loading"→"ready"`) plus stable `[data-stash-*]` semantic selectors. New `?agent=json` and `?agent=markdown` browser-only client-rendered views.
  - OpenAPI / `llms.txt`: description notes calling out the new `/stashes` profile-local surface for browser agents; no `/stashes` path entry added (it is not a fetch endpoint).
  - E2E: new `packages/e2e/specs/local-bridge.spec` covering bridge-enabled surface, bridge-disabled fallback, no-persistence, and fetch-only baseline.

### Patch Changes

- e3a02fb: feat(evals): agent-first tool benchmark — new evals covering the full agent
  matrix (`post_json` MCP round-trip, `eval_js` WebCrypto decrypt round-trip,
  encrypted fail-closed honesty), per-eval metrics (latency, tool calls) in
  `report-<model>.json`, `EVAL_FILTER`/`EVAL_DEBUG` knobs, and harness fixes:
  transport-flake retry, a 360s request timeout, `unhandledRejection` guard for
  model-sandboxed JS, proxy `content-encoding`/`content-length` forwarding fix,
  object-typed `stash-settings` seeding, `__name`-free DOM evals, empty
  assistant-turn nudges (harmony-format models emit blank turns), `<|channel|>`
  tool-name normalization, `eval_js` no-output teaching, and graders that score
  retrieved data in final prose when no structured `answer()` was emitted.

  fix(shared): zero-trust share key is now 32 bytes — real AES-256-GCM as
  documented (was 16 bytes / AES-128).

  docs(viewer): `llms.txt` gains a copy-pasteable WebCrypto decrypt worked
  example and names the viewer origin for `?p=` decode.

  fix(viewer): PostHog no longer captures URL fragments — `capture_pageview`
  was shipping the entire `/s#p=` stash payload to PostHog on every pageview;
  `disable_capture_url_hashes` is now set in both layouts.

- b635f89: feat(server-core,viewer,mirror): machine-checkable error contract — every JSON
  error body is now `{ error, code, hint? }` with a stable `StashErrorCode` token
  (`unknown_format`, `invalid_payload`, `encrypted_payload`, `rate_limited`, …)
  and an actionable `hint` naming the corrected call shape. Agents can switch on
  `code` instead of parsing English. Applies to `POST /api/stash`,
  `DELETE /api/stash/:id`, `GET /s/:id`, `GET /s?p=` (viewer function + mirror),
  429s, and MCP tool error results (`stash_get` now returns
  `{error:"encrypted", code:"encrypted_payload", hint}` on zero-trust entries).

  feat(server-core): `GET /s/:id` HTML redirects carry
  `Link: </s/<id>?format=json>; rel="alternate"; type="application/json"` so
  content-negotiation alternatives are discoverable from headers alone.

  feat(viewer): `_headers` adds `Link: rel="alternate"` discovery on `/s` and
  `/stashes/` (JSON/Markdown alternates + llms pointer), mirroring the in-page
  `<link rel="alternate">` tags.

  feat(shared): `@stash/shared/error-contract` — `stashError()` builder +
  `StashErrorCode` union shared across server-core, viewer functions, and mirror.

  docs(viewer): `llms.txt` gains an "Error contract" table (code → meaning →
  recovery); MCP tool descriptions spell out inputs, return shapes, error
  tokens, and negative usage (when to use `stash_decode` vs `stash_get`);
  OpenAPI `ErrorResponse` documents the full code enum.

  feat(evals): new `error-contract-recovery` eval (model is handed an
  unsupported `?format=` URL and must recover via the error contract);
  `fetch_url` surfaces `Link:` headers; `eval_js` teaches serialization
  (raw `ArrayBuffer`/`TypedArray` results decode to text instead of silently
  stringifying to `{}`) and its description states the JSON-serializable
  requirement; per-chat tool-round cap 6 → 8 so slow-but-correct multi-step
  flows (decrypt → decode) can finish.

- Updated dependencies [7007184]
  - @stash/codec@0.10.0

## 0.9.0

### Minor Changes

- 2443a0b: Move canonical payload fixtures into `@stash/shared` (`fixtures/payloads.json`, `fixtures/sample-tabs.json`) with a pure loader exported from the new `./fixtures` subpath (`loadPayloadFixtures`, `PayloadFixture`), and add `#q=` QR fixtures (`qr-single-tab`, `qr-three-tabs`) plus a v6 metadata fixture (`tagged-stash`). Also add a shared content-negotiation contract (`negotiation.ts`: `negotiateFormat`, `FORMAT_ALIASES`, `isValidFormatParam`, `NEGOTIATION_CASES`) that the viewer and server-core will consume.

### Patch Changes

- @stash/codec@0.9.0

## 0.8.1

### Patch Changes

- @stash/codec@0.8.1

## 0.8.0

### Patch Changes

- Updated dependencies [433b330]
  - @stash/codec@0.8.0

## 0.7.1

### Patch Changes

- @stash/codec@0.7.1

## 0.7.0

### Patch Changes

- @stash/codec@0.7.0

## 0.6.0

### Minor Changes

- cb1a180: Add /s/new page for on-the-fly stash creation and fix codec URL encoding

### Patch Changes

- Fix GitHub Release workflow to use exact file paths instead of globs for extension artifact uploads
- Updated dependencies
- Updated dependencies [cb1a180]
  - @stash/codec@0.6.0
