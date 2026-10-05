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
