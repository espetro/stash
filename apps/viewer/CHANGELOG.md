# stash-viewer

## 0.10.3

### Patch Changes

- fix(viewer): floating centered navbar on /s routes, drop landing Settings button
  - `/s/new` and `/stashes` get a floating centered pill (back chevron,
    New stash / My stashes, divider, theme + language) via a reworked
    `AppHeader` with an in-flow spacer; the edge-pinned header is gone.
  - Landing navbar drops the rounded Settings button (theme/lang controls
    no longer duplicate the Install CTA); `SettingsMenu` removed.
  - @stash/codec@0.10.3
  - @stash/theme@0.10.3
  - @stash/shared@0.10.3

## 0.10.2

### Patch Changes

- fix(viewer): restore block navbar on landing + real Chrome Web Store link
  - Landing navbar returns to the classic full-width block bar (logo left,
    links centered, Settings + Install dropdown right); the floating pill
    style is gone — `/s/` routes keep their own minimal `AppHeader`.
  - `INSTALL_CHROME_URL` now points at the live Chrome Web Store listing
    (`VITE_CHROME_DOWNLOAD_URL` still overrides).
  - @stash/codec@0.10.2
  - @stash/theme@0.10.2
  - @stash/shared@0.10.2

## 0.10.1

### Patch Changes

- 049b544: fix(viewer): replace dead landing nav placeholders with real links

  The landing navbar showed SaaS-style entries (`Products`, `Solutions`,
  `Resources`, `Developers`, `Enterprise`, `Pricing`, `Contact Sales`) where
  four linked only to `#`. The nav now lists the actual destinations —
  Features, How it works, Demo (page anchors) and Docs (`/docs`) — with the
  unused placeholder i18n keys removed across locales.
  - @stash/codec@0.10.1
  - @stash/theme@0.10.1
  - @stash/shared@0.10.1

## 0.10.0

### Minor Changes

- 401e0ea: feat(extension,viewer): zero-trust client flip — the extension's "Shorten link" and the viewer's own short-link creation now encrypt the payload client-side (AES-256-GCM, per-share 128-bit key) and upload only ciphertext; share URLs carry the key in `#<key>` (never sent to any server). The viewer decrypts relayed `/s?id=<id>&relay=<origin>#<key>` links locally — fetching the ciphertext envelope from the minting relay (`&relay=`, http(s) origins only) — fails closed on missing key, tampered ciphertext, or expired entries. Failures fall back silently to self-contained `#p=` links.
- d95251f: docs(agent-surface): reconcile the agent-facing contract with zero-trust relaying — `llms.txt`, the OpenAPI spec (dual-mode POST, `CiphertextEnvelope` schema, 409 semantics, `itemCount` now optional on `StashCreated`), the mirror `LLMS_TXT` probe target, `agent-server.md`, and relay/mirror AGENTS.md now document the `enc` gate: encrypted entries return a ciphertext envelope on `?format=json`, 409 on md/txt, and redirect to `?id=<id>&relay=<origin>`; plaintext entries (all `stash_create` calls) keep full server-side decode.
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
- 049b544: fix(viewer): replace dead landing nav placeholders with real links

  The landing navbar showed SaaS-style entries (`Products`, `Solutions`,
  `Resources`, `Developers`, `Enterprise`, `Pricing`, `Contact Sales`) where
  four linked only to `#`. The nav now lists the actual destinations —
  Features, How it works, Demo (page anchors) and Docs (`/docs`) — with the
  unused placeholder i18n keys removed across locales.

- Updated dependencies [e3a02fb]
- Updated dependencies [b635f89]
- Updated dependencies [5f44887]
- Updated dependencies [7007184]
  - @stash/shared@0.10.0
  - @stash/codec@0.10.0
  - @stash/theme@0.10.0

## 0.9.0

### Minor Changes

- 8d72ba5: Improve agent URL extraction across the viewer and shortener:
  - `apps/viewer`: fix `<link rel="alternate">` tags in the layout (emit
    `/json?p=` and `/md?p=` for hook-side fill instead of the previous
    broken `?format=…`).
  - `apps/viewer`: add `"Copy as agent URL"` button to `ShareDrawer`,
    copying `<origin>/s?p=<encoded>` so fetch-only agents can consume
    the same link without depending on the URL fragment.
  - `apps/viewer`: extend `public/llms.txt` with a worked URL → JSON →
    MD example and the shortener's `/s/<id>[.json|.md]` surface.
  - `apps/viewer`: split the OpenAPI spec builder into
    `src/lib/openapi-spec.ts` and document the shortener's `/api/stash`,
    `/s/<id>`, `/s/<id>.json`, and `/s/<id>.md` routes under the
    `s.illo.fyi` server URL.
  - `apps/viewer` + `@stash/server-core`: add `Accept: text/plain`
    content negotiation to both `/s?p=<payload>` and `GET /s/<id>`
    (plus a `.txt` suffix on the shortener); text responses render a
    plain URL list, one per line.

- 1b5b0aa: Viewer agent-surface hardening (W3 of the agent-readability plan):
  - `functions/s.ts` consumes the shared `negotiateFormat` /
    `isValidFormatParam` contract from `@stash/shared/negotiation`
    (explicit `?format=` wins, then `Accept`, then HTML fallthrough).
  - An unknown `format` param now returns `400` JSON instead of a silent
    HTML redirect, and a non-decode server error during a negotiated
    response returns `500` JSON instead of falling through to HTML.
  - OpenAPI spec: drop the stale `/s/{id}.json` / `/s/{id}.md` suffix
    paths, document the `format` param on `/s/{id}` (suffix routes now
    301-redirect on the shortener; removal noted for a future release).
  - `llms.txt` short-URL section rewritten for the consolidated
    `?format=` API, including `text/plain` and the legacy-suffix note.
  - New contract tests: `llms-contract.test.ts` (documented endpoint and
    format combinations resolve against the real handler; OpenAPI paths
    stay within handled routes), built-HTML alternate-link check
    (`pnpm --filter stash-viewer run test:dist`), and fixture-driven
    tests covering the `#q=` base32 payload and v6 `tags`/`note`
    metadata via the shared fixtures loader.

### Patch Changes

- 6639a39: Consolidate agent decode endpoints into `/s?p=` with Accept + `?format=` negotiation (removes the `/json?p=` and `/md?p=` routes).
- Updated dependencies [2443a0b]
  - @stash/shared@0.9.0
  - @stash/codec@0.9.0
  - @stash/theme@0.9.0

## 0.8.1

### Patch Changes

- Floating pill navbar with shadcn-style NavigationMenu and a Settings
  dropdown (theme + language). Footer is now links-only — theme and
  language controls moved to the navbar.
  - @stash/codec@0.8.1
  - @stash/theme@0.8.1
  - @stash/shared@0.8.1

## 0.8.0

### Minor Changes

- 433b330: Payload schema v6: optional top-level tags and note. Decoder accepts v4/v5/v6; v4/v5 stay decode-only legacy. Adds local stash library, My Stashes UI, MCP tool set, opt-in short links, and telemetry.
- 64603e9: UX cleanup for popup and viewer: shorten-on-demand with link type hints, save-stash form (title, tags, note), header back navigation, grouped copy actions, viewer app header nav, stacked primary actions to prevent overflow.

### Patch Changes

- Updated dependencies [433b330]
  - @stash/codec@0.8.0
  - @stash/shared@0.8.0
  - @stash/theme@0.8.0

## 0.7.1

### Patch Changes

- @stash/codec@0.7.1
- @stash/theme@0.7.1
- @stash/shared@0.7.1

## 0.7.0

### Minor Changes

- d151ee9: Locale-prefixed landing URLs (`/es`, `/fr`, `/ru`) with full i18n coverage of every landing section. Adds `<html lang>`, hreflang alternates, canonical tags, and `@astrojs/sitemap` integration. The `intl-ai` config now loads `.env` automatically via Node's built-in `loadEnvFile`, so `pnpm run i18n:fill` works without sourcing env vars manually.

### Patch Changes

- @stash/codec@0.7.0
- @stash/theme@0.7.0
- @stash/shared@0.7.0

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
