# Agent Runtime Compatibility Matrix

This matrix tracks, per browser/agent runtime, whether each Stash
agent-facing surface is verified working, and what evidence backs that
claim — an automated conformance/eval report id, or a dated manual
check. The goal is that "does this work on BrowserOS" has a citable
answer instead of a one-off manual poke.

## Matrix

| Runtime | `/s?p=` fetch (JSON/MD/TXT) | `/stashes` island | `?agent=json` | `?agent=markdown` | extension MCP |
|---|---|---|---|---|---|
| BrowserOS 148 | verified — `runtime-conformance-browseros.json` (curated snapshot, see Evidence sources), 2026-08-24, all 5 `agent-runtime-conformance.spec` scenarios pass (`pnpm --filter @stash/e2e run test:browseros`) | verified, two distinct claims — **browser-runtime** (Playwright-driven Chromium fork): verified, same report as left. **Agent-panel** (BrowserOS's own built-in LLM agent, not CDP-driven): verified — manual POC, 2026-08-25, production `stash.illo.fyi`, real user profile. Agent found and read the one seeded stash correctly, but by clicking into it via DOM navigation rather than reading `#stash-local-export`/`?agent=json` — a legibility gap, tracked in `.agents/plans/2026-08-24-stashes-agent-discoverability.md`, not a fail per the caveat below (no selector hints were given). | verified — same automated report (browser-runtime only; agent-panel did not use this endpoint, see previous cell) | verified — same automated report (browser-runtime only) | verified — same report |
| Chrome + nanobrowser | blocked (automated) — `runtime-conformance-chrome.json` (curated snapshot), 2026-08-24: signed/branded Google Chrome refuses `--load-extension`/`--disable-extensions-except` for unpacked extensions. **Retested 2026-08-25** with the documented escape hatch (`--disable-features=DisableLoadExtensionCommandLineSwitch`, scoped to `BROWSER_LABEL=chrome`): still fails on installed Chrome 151.0.7922.174 — all 5 `test:chrome` scenarios `ERR_BLOCKED_BY_CLIENT` on the placeholder extension id. This is now a confirmed negative result, not an untested assumption; only the manual POC script below can reach this runtime | blocked (automated) — same reason | blocked (automated) — same reason | blocked (automated) — same reason | blocked (automated) — same reason |
| Chrome + ChromeClaw | blocked (automated) — same branded-Chrome CLI restriction as above, confirmed via the same 2026-08-25 escape-hatch retest, see `runtime-conformance-chrome.json` | blocked (automated) — same reason | blocked (automated) — same reason | blocked (automated) — same reason | blocked (automated) — same reason |
| stock Chromium | verified — `runtime-conformance-stock-chromium.json` (curated snapshot), 2026-08-24, all 5 `agent-runtime-conformance.spec` scenarios pass via Playwright's managed unbranded `channel: "chromium"` (`pnpm --filter @stash/e2e exec playwright test --grep runtime`) | verified — same report | verified — same report | verified — same report | verified — same report |
| Firefox | untested — Playwright cannot drive a stock Gecko binary, only its own patched build — manual checklist only, not yet run | untested — same | untested — same | untested — same | untested — same |
| Zen | untested — Playwright cannot drive a stock Gecko binary, only its own patched build — manual checklist only, not yet run | untested — same | untested — same | untested — same | untested — same |
| Claude Code | verified — `pnpm --filter @stash/e2e run probe:agent-uas`, 2026-08-25, 20/20 checks pass against production (`stash.illo.fyi`/`s.illo.fyi`) under `Claude-User/1.0` and `ClaudeBot/1.0`. Was blocked by Cloudflare's "Block AI bots" managed rule as of 2026-08-24 (403 "Your request was blocked"); confirmed independently open again by 2026-08-25 — the WAF Skip rule from the plan doc (or an equivalent Cloudflare-side change) has already been applied. Re-run the probe periodically; it is the standing regression-catcher | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model |
| Gemini web | verified — same `probe:agent-uas` run and evidence as Claude Code (`GPTBot/1.0`... note: Gemini's own crawler UA is not yet in the probe's UA list; only GPTBot/ChatGPT-User/Claude UAs are covered today) — treat as **untested** for Gemini's specific UA until added, though the underlying WAF rule is confirmed UA-list-based, not Claude-specific | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model |
| ChatGPT browsing | verified — `pnpm --filter @stash/e2e run probe:agent-uas`, 2026-08-25, 20/20 checks pass under `GPTBot/1.0` and `ChatGPT-User/1.0` against production | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model |

Status vocabulary is exactly one of `verified`, `blocked`, `untested`.
Every cell carries a status plus an evidence pointer (or "no evidence
yet" when genuinely untested with nothing pending).

## Manual proof-of-concept script

For runtimes automation cannot reach — nanobrowser's and BrowserOS's
built-in agents are LLM-driven UIs, not CDP-drivable; Playwright can
launch BrowserOS's browser binary but not drive its built-in agent
panel — verify the `/stashes` island manually:

1. Build the extension, load it unpacked into the target runtime.
2. Seed three stashes through the popup.
3. Enable **Settings → Local Library Bridge** (checkbox
   `#local-library-enabled-checkbox`, label "Expose local stash library
   to /stashes").
4. Paste this exact agent prompt card into the runtime's agent panel —
   keep it **verbatim** across every runtime tested so results are
   comparable:

   > Open https://stash.illo.fyi/stashes and tell me every stash saved
   > in this browser, with each stash's title and the URLs it contains.
   > Return the result as JSON.

5. Diff the returned JSON against the seeded library (title + URLs
   match, no extra/missing stashes).
6. Record pass/fail and the date tested in the matrix cell for that
   runtime's `/stashes` island column.

**Caveat:** the prompt deliberately does not mention the island,
`?agent=json`, or any CSS selector. If a runtime needs those hints to
succeed, that is a legibility finding to feed back into `llms.txt`, not
a passing result. Interpret partial/hinted successes accordingly when
recording results.

## Eval results (2026-08-24)

`pnpm --filter @stash/evals run eval` against `nvidia/nemotron-3-super-120b-a12b:free`
via OpenRouter, run 3 times for consistency (`packages/evals/report.json`,
gitignored — not a runtime-conformance report, model-capability evidence):

- `decode-comprehension`, `format-discovery`, `short-link-read` — pass, all 3 runs.
- `negative-fetch-only` — pass in 2/3 runs, one transient OpenRouter error
  (`OpenRouter returned no message`) unrelated to the eval itself.
- `alternate-link-discovery` — failed all 3 runs with a low-level
  `terminated` network error from the OpenRouter call (not a grader
  failure or a code defect in the eval harness) — likely free-tier
  throttling on this eval's larger HTML-embedding prompt. Unresolved;
  worth retrying with a paid model tier before concluding this surface
  is broken.
- `island-extraction` — failed all 3 runs (model never located
  `#stash-local-export` from llms.txt + raw DOM alone). This is the
  free-tier model's actual capability on the task the eval is designed
  to measure, not an infra error — a genuine (if narrow) legibility
  finding, not something to "fix" in this pass.

## Eval results, paid model (2026-08-25)

`pnpm --filter @stash/evals run eval` against `qwen/qwen3.7-flash`
(paid, via OpenRouter) hit persistent 429s from the Alibaba provider
across 3 consecutive runs — not free-tier throttling, a live
provider-side capacity issue on that specific model/backend. Switched
to `openai/gpt-oss-20b` (paid, different provider), which ran cleanly
4 runs in a row with no rate limiting:

- `decode-comprehension`, `format-discovery`, `short-link-read`,
  `negative-fetch-only` — mostly pass; one flaky `format-discovery` FAIL
  and one flaky `decode-comprehension` FAIL/missing-domain across the 4
  runs, not reproducible on retry — treat as model-level noise, not a
  defect.
- `alternate-link-discovery` — **failed all 4 runs, on two different
  paid models/providers (qwen3.7-flash and gpt-oss-20b), with the same
  `terminated` low-level network error.** This directly contradicts the
  2026-08-24 free-tier hypothesis ("likely free-tier throttling") — the
  failure is structural (probably payload size/timeout on this eval's
  large embedded-HTML prompt against the OpenRouter API), not a
  free-tier artifact. Needs its own investigation in a future pass; do
  not attribute to model tier going forward.
- `island-extraction` — failed consistently on `openai/gpt-oss-20b` too
  (paid). Confirms the 2026-08-24 free-tier finding was not a
  capability-tier issue: even a paid model does not find
  `#stash-local-export` from `llms.txt` + raw DOM alone. This is now
  corroborated by a live manual BrowserOS agent-panel POC (see the
  matrix row above) exhibiting the same behavior — reads the page but
  falls back to per-item DOM interaction instead of the bulk export.
  Tracked for future work, not fixed in this pass:
  `.agents/plans/2026-08-24-stashes-agent-discoverability.md`.

## Notes

- **Production `robots.txt`** lagged `develop`'s `Allow: /s` fix as of
  2026-08-24 (prod served `Disallow: /s`, blocking the exact route
  `llms.txt` tells agents to fetch). The fix (`47bfc0b`) is already on
  `develop`, 16+ commits ahead of `main`; prod deploys from `main`, so
  this self-resolves on the next release. No action needed here.
- The `runtime-conformance-{chrome,stock-chromium,browseros}.json`
  reports cited above are **curated snapshots**, not raw output of
  `lib/runtime-conformance-reporter.ts` (which only emits
  `{runtime, version, userAgent, results}` — no `status`/`reason`/`notes`
  fields). Treat their `status`/`reason`/`notes` framing as
  hand-authored commentary layered on top of a real automated run, not
  as reporter-generated evidence on its own.

## Evidence sources

- **Automated conformance report** —
  `packages/e2e/reports/runtime-conformance.json` (gitignored; produced
  by `pnpm --filter @stash/e2e run test --grep @runtime` or
  `pnpm --filter @stash/e2e run test:browseros`). Cite by `runtime` +
  scenario `id`.
- **Eval report** — `pnpm eval:agents` output. Cite by eval name
  (`alternate-link-discovery`, `island-extraction`,
  `negative-fetch-only`).
- **Manual POC** — cite as "manual, YYYY-MM-DD" per the script above.

## Eval model choice

Target **low-cost paid models** for `packages/evals` runs (root `.env`
`OPENROUTER_MODEL_ID`) — free-tier models are throttled/queued
unpredictably (see the 2026-08-24 free-tier run above), and expensive
frontier models aren't needed to measure the agent-legibility surfaces
these evals target. Prefer models with a low `$/token` price and
`tools`/`tool_choice` in OpenRouter's `supported_parameters` (check via
`curl -s https://openrouter.ai/api/v1/models`). If a model's provider
starts rate-limiting (`OpenRouter 429 ... temporarily rate-limited
upstream`), that is provider-specific capacity, not a reason to fall
back to the free tier — switch to a different cheap model/provider
instead (e.g. `openai/gpt-oss-20b` was used as the 2026-08-25 fallback
after `qwen/qwen3.7-flash`/Alibaba hit persistent 429s).

## Deferred follow-ups

- `.agents/plans/2026-08-24-stashes-agent-discoverability.md` — browser
  agents (BrowserOS's built-in agent, and the `island-extraction` eval
  on two paid models) don't find `/stashes`'s bulk JSON export
  (`#stash-local-export`/`?agent=json`) without explicit hints, despite
  it being documented in `llms.txt`. Also flags a real bug: the `/s`-only
  `rel="alternate"` link tags in `ViewerLayout.astro` false-positive-match
  `/stashes` (`pathname.startsWith('/s')`), emitting a wrong link on that
  page. Research/implementation deferred to a future session.
