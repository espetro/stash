# @stash/server-core

## 0.2.0

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

- 7f99ed4: Expose both MCP surfaces (shortener + extension) in the discovery card, keep legacy flat fields for backward compatibility.
- a7c69d4: Unify agent content negotiation on `GET /s/:id`: add the `?format=json|md|txt` query param (with the `markdown|plain|text` aliases) using the shared negotiation contract from `@stash/shared`, taking precedence over `Accept` header negotiation; unknown `format` values now return a 400 JSON error instead of falling through to an HTML redirect.

  The legacy `/s/:id.json|.md|.txt` suffix routes are deprecated: they now 301-redirect to `/s/:id?format=<fmt>` and will be removed in the next release. llms.txt and the OpenAPI spec are deployed artifacts, so agents that cached the suffix routes keep working for one release. The discovery card at `/.well-known/mcp-server-card` now lists an `endpoints` array (HTTP decode surface, openapi.json, llms.txt).

### Patch Changes

- Updated dependencies [2443a0b]
  - @stash/shared@0.9.0
  - @stash/codec@0.9.0

## 0.1.4

### Patch Changes

- @stash/codec@0.8.1
- @stash/shared@0.8.1

## 0.1.3

### Patch Changes

- Updated dependencies [433b330]
  - @stash/codec@0.8.0
  - @stash/shared@0.8.0

## 0.1.2

### Patch Changes

- @stash/codec@0.7.1
- @stash/shared@0.7.1

## 0.1.1

### Patch Changes

- @stash/codec@0.7.0
- @stash/shared@0.7.0
