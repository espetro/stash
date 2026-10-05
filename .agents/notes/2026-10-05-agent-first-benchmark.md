# Agent-first tool-eval benchmark (2026-10-05)

Extended `packages/evals` into a tool-eval benchmark: precision + latency +
tool-call metrics across the whole agent surface (`#p=`/`?format=`/Accept
negotiation, alternate-link discovery, short links, encrypted entries via
`eval_js`, `post_json` MCP round-trip, `/stashes` bridge islands).

## Findings the benchmark surfaced (all fixed)

- **Eval-harness proxy bug**: `bootAgentViewer`/`bootShortener` forwarded
  `content-encoding: gzip` + `content-length` headers while writing the
  *decompressed* body → undici `terminated` on every gzipped response.
- **Model-sandbox crashes**: `eval_js` `Promise.race` left late rejections
  unhandled → process died mid-benchmark (Node crashes on unhandled
  rejections; model code like un-awaited `crypto.subtle.decrypt` triggers it).
  Runner now logs-and-continues; the tool defuses its own race promise.
- **No request timeout on the LLM client**: a stalled upstream stream hung an
  eval for 20+ min. `once()` now uses `AbortSignal.timeout(360_000)` and
  transport flakes (terminated/abort/timeout) retry once.
- **Chrome storage convention**: WXT `StorageItem` stores structured values —
  seeding `stash-settings` with a JSON *string* leaves
  `localLibraryViewerEnabled` undefined → bridge `request` returns
  `bridge_disabled` and `/stashes` renders an empty "ready" island. Write the
  parsed object, not `JSON.stringify(parsed)`.
- **esbuild `__name` in `page.evaluate`**: named inner functions inside
  evaluate callbacks get esbuild's `__name` wrapper, which does not exist in
  the browser context → `ReferenceError`. Use anonymous arrows or
  string-evaluate.
- **Doc-vs-impl crypto drift**: `generateShareKey` produced 16-byte keys
  (AES-128-GCM) while every doc claimed AES-256. `KEY_BYTES` is now 32 →
  true AES-256.
- **llms.txt was not executable**: prose-only decrypt recipe; mid-size models
  consistently failed to implement it. A worked WebCrypto example +
  naming the viewer origin for `?p=` decode took `encrypted-decrypt-roundtrip`
  from fail to pass on gpt-4o-mini.
- **MCP wire shape needs to be spelled out**: `tools/call` requires
  `{name, arguments}` — models guessed `tool`/`args` variants until the
  prompt showed the exact envelope.

## Baseline (OpenRouter, 2026-10-05)

See `report-openai_gpt-4o-mini.json` / `report-openai_gpt-oss-20b.json`.

- gpt-4o-mini: ~7-8/10, mean ~6.5s/eval, ~25 tool calls — decrypt + MCP +
  bridge islands pass; flaky on alternate-link `format=json` and
  snapshot answer titling.
- gpt-oss-20b: ~5-6/10, mean ~90s/eval — plaintext + fail-closed paths pass;
  cannot complete eval_js decrypt or structured `answer()` calls.

Run: `OPENROUTER_API_KEY=… OPENROUTER_MODEL_ID=<slug> pnpm --filter @stash/evals run eval`
(`EVAL_FILTER=<substr>`, `EVAL_DEBUG=1` for transcripts stacks).
