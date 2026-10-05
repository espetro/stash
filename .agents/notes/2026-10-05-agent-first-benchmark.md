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

See `report-<model>.json` artifacts. **After round-2 harness fixes:**

- gpt-4o-mini: **10/10**, mean ~7s/eval, 26 tool calls.
- gpt-oss-20b: island + snapshot + decrypt were all lost to *empty assistant
  turns* (harmony-format quirk) — see below; decrypt remains a legit
  capability fail.

Run: `OPENROUTER_API_KEY=… OPENROUTER_MODEL_ID=<slug> pnpm --filter @stash/evals run eval`
(`EVAL_FILTER=<substr>`, `EVAL_DEBUG=1` for transcripts stacks).

## Round-2 fixes (driving gpt-4o-mini 7/10 → 10/10, gpt-oss 7/10 → ~9/10)

- **Empty assistant turns are not final answers.** gpt-oss emits
  `content:""` + no tool calls mid-conversation (harmony format). The chat
  loop treated that as the final answer and discarded all prior tool work —
  it even killed runs *after* a successful decrypt. `client.chat` now pushes
  a "your last response was empty" user nudge (max 2) and keeps the loop
  going. Rescued island-extraction, snapshot-extraction on gpt-oss.
- **Grade retrieval, not plumbing.** `gradeIslandExtraction` required a
  structured `answer()` call; gpt-oss surfaced every title + URL in final
  prose instead. Grader now accepts correct data in the final response text
  when no structured answer exists — the `answer` tool is harness plumbing,
  not product behavior.
- **Prompt ambiguity → page title ≠ stash title.** 4o-mini copied the page
  `<title>` ("My Stashes") into stash 1's title in `answer()`. Task now says
  "each stash's own stored title … not the page <title>".
- **`format=json` grading stays strict on purpose.** 4o-mini fetched
  `/s?p=` without `format=` and got JSON *only because the harness sends
  `Accept: application/json`*. Real agents without that header get the HTML
  shell — the `<link rel=alternate>` href includes `format=json`, so
  dropping it is a genuine miss. Kept.
- **`eval_js` "no output" now teaches.** "Did you forget `return` or
  console.log?" — unblocks models that define-but-never-call functions
  (still insufficient for gpt-oss, which repeated the same pattern 3×).
- **gpt-oss limits (legit fails)**: leaks `<|channel|>commentary` into tool
  names; can't produce a top-level `return` in eval_js across retries.
