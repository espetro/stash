---
"@stash/server-core": minor
"@stash/shortener": minor
"@stash/mirror": minor
---

feat(server-core): dual-mode zero-trust relay — `POST /api/stash` accepts `{ciphertext}` (stored opaque, `enc` marker) alongside legacy `{payload}` (validated plaintext, stored readable). `GET /s/:id` gates on `entry.enc`: encrypted entries return a ciphertext envelope (`?format=json`), fail closed 409 for md/txt, and redirect to `viewer?id=<id>&relay=<origin>`; plaintext entries keep full decode/format/`#p=` behavior so agent flows and pre-existing links keep working. MCP `stash_get` fails closed on encrypted entries.
