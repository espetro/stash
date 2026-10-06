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
  names (dispatcher now strips); can't produce a top-level `return` in
  eval_js across retries — same fail on 20b AND 120b, so it's a family
  limitation, not a size one.
- **PostHog was leaking `#p=` payloads**: `capture_pageview` without
  `disable_capture_url_hashes` ships `$current_url` WITH the fragment —
  whole stash payload to PostHog EU per pageview. Fixed in both layouts;
  audit any future client-side analytics/error tracker for the same class.

## Panel results (EVAL_MODELS sweep, 2026-10-05)

| model | pass | calls | tok | mean |
|---|---|---|---|---|
| gpt-5-nano | 10/10 | 16 | 127k | 28s |
| gpt-4o-mini | 10/10 | 26 | — | ~7s |
| gpt-oss-120b | 9/10 | 25 | 131k | 50s |
| nemotron-3-super-120b:free | 9/10 | 31 | 260k | 27s |
| gpt-oss-20b | ~9/10 | ~30 | — | ~60s |
| ling-3.1-flash | unrunnable (upstream 429) | | | |

Discriminating evals: encrypted-decrypt-roundtrip (gpt-oss family fails
outright; 4o-mini/5-nano/nemotron pass) and alternate-link-discovery
`format=json` precision (nemotron + flaky 4o-mini drop the param).

## Round 3: contract precision (2026-10-05, same-day follow-up)

The BFCL-v4-inspired pass: stable `code` + actionable `hint` on every JSON
error, `Link: rel="alternate"` headers, precise MCP tool descriptions, an
llms.txt error table — plus two harness gaps the run exposed.

- **nemotron-3-super-120b:free: 9/10 → 11/11** — both prior misses
  (`format=json` precision, decrypt) now pass, plus the new
  `error-contract-recovery` eval.
- **gpt-4o-mini: decrypt now passes in 4 calls / 12s** — the failure was
  `crypto.subtle.decrypt` returning `ArrayBuffer`, which `JSON.stringify`
  renders `{}`. `eval_js` now decodes byte results to text and teaches the
  serialization requirement in its description.
- **gpt-oss-20b decrypts too now** (the same `return:` teaching unblocked
  its crypto step) — but it still fails the eval legitimately: it has the
  payload and tries to msgpack-decode it in JS instead of handing it to
  `/s?p=&format=json`. Orchestration gap, not crypto — the eval now
  discriminates a real capability difference.
- **New discriminating eval**: `error-contract-recovery` — model is given
  `/s/<id>?format=xml`, must read the `{error, code, hint}` 400 body and
  recover. Both models passed in 3 calls / ~2k tokens — cheapest eval in
  the suite, and evidence the hints work as designed.
- **Harness learning**: `MAX_TOOL_ROUNDS` 6 → 8 — real agents aren't
  hard-capped; a slow-but-correct multi-step flow was being truncated
  mid-success. Efficiency stays measurable via the tool-call metric.
