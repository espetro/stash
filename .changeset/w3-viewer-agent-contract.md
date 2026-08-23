---
"stash-viewer": minor
---

Viewer agent-surface hardening (W3 of the agent-readability plan):

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
