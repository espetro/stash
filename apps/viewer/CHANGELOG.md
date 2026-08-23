# stash-viewer

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
