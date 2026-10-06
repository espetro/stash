---
"stash-viewer": minor
"@stash/mirror": patch
---

docs(agent-surface): reconcile the agent-facing contract with zero-trust relaying — `llms.txt`, the OpenAPI spec (dual-mode POST, `CiphertextEnvelope` schema, 409 semantics, `itemCount` now optional on `StashCreated`), the mirror `LLMS_TXT` probe target, `agent-server.md`, and relay/mirror AGENTS.md now document the `enc` gate: encrypted entries return a ciphertext envelope on `?format=json`, 409 on md/txt, and redirect to `?id=<id>&relay=<origin>`; plaintext entries (all `stash_create` calls) keep full server-side decode.
