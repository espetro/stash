# @stash/server-core

## 0.3.2

### Patch Changes

- @stash/codec@0.10.2
- @stash/shared@0.10.2

## 0.3.1

### Patch Changes

- @stash/codec@0.10.1
- @stash/shared@0.10.1

## 0.3.0

### Minor Changes

- 524f935: feat(server-core): dual-mode zero-trust relay — `POST /api/stash` accepts `{ciphertext}` (stored opaque, `enc` marker) alongside legacy `{payload}` (validated plaintext, stored readable). `GET /s/:id` gates on `entry.enc`: encrypted entries return a ciphertext envelope (`?format=json`), fail closed 409 for md/txt, and redirect to `viewer?id=<id>&relay=<origin>`; plaintext entries keep full decode/format/`#p=` behavior so agent flows and pre-existing links keep working. MCP `stash_get` fails closed on encrypted entries.

### Patch Changes

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

- Updated dependencies [e3a02fb]
- Updated dependencies [b635f89]
- Updated dependencies [5f44887]
- Updated dependencies [7007184]
  - @stash/shared@0.10.0
  - @stash/codec@0.10.0

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
