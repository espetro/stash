---
"@stash/evals": patch
"@stash/shared": patch
"stash-viewer": patch
---

feat(evals): agent-first tool benchmark — new evals covering the full agent
matrix (`post_json` MCP round-trip, `eval_js` WebCrypto decrypt round-trip,
encrypted fail-closed honesty), per-eval metrics (latency, tool calls) in
`report-<model>.json`, `EVAL_FILTER`/`EVAL_DEBUG` knobs, and harness fixes:
transport-flake retry, a 360s request timeout, `unhandledRejection` guard for
model-sandboxed JS, proxy `content-encoding`/`content-length` forwarding fix,
object-typed `stash-settings` seeding, and `__name`-free DOM evals.

fix(shared): zero-trust share key is now 32 bytes — real AES-256-GCM as
documented (was 16 bytes / AES-128).

docs(viewer): `llms.txt` gains a copy-pasteable WebCrypto decrypt worked
example and names the viewer origin for `?p=` decode.
