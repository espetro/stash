---
"@stash/shared": patch
"@stash/server-core": patch
"stash-viewer": patch
"@stash/mirror": patch
"@stash/evals": patch
---

feat(server-core,viewer,mirror): machine-checkable error contract — every JSON
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
