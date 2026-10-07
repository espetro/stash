# @stash/mirror

## 0.2.5

### Patch Changes

- @stash/codec@0.10.5
- @stash/shared@0.10.5
- @stash/server-core@0.3.5

## 0.2.4

### Patch Changes

- @stash/codec@0.10.4
- @stash/shared@0.10.4
- @stash/server-core@0.3.4

## 0.2.3

### Patch Changes

- @stash/codec@0.10.3
- @stash/shared@0.10.3
- @stash/server-core@0.3.3

## 0.2.2

### Patch Changes

- @stash/codec@0.10.2
- @stash/shared@0.10.2
- @stash/server-core@0.3.2

## 0.2.1

### Patch Changes

- @stash/codec@0.10.1
- @stash/shared@0.10.1
- @stash/server-core@0.3.1

## 0.2.0

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

- d95251f: docs(agent-surface): reconcile the agent-facing contract with zero-trust relaying — `llms.txt`, the OpenAPI spec (dual-mode POST, `CiphertextEnvelope` schema, 409 semantics, `itemCount` now optional on `StashCreated`), the mirror `LLMS_TXT` probe target, `agent-server.md`, and relay/mirror AGENTS.md now document the `enc` gate: encrypted entries return a ciphertext envelope on `?format=json`, 409 on md/txt, and redirect to `?id=<id>&relay=<origin>`; plaintext entries (all `stash_create` calls) keep full server-side decode.
- Updated dependencies [e3a02fb]
- Updated dependencies [b635f89]
- Updated dependencies [5f44887]
- Updated dependencies [524f935]
- Updated dependencies [7007184]
  - @stash/shared@0.10.0
  - @stash/server-core@0.3.0
  - @stash/codec@0.10.0
