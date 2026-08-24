# Agent Runtime Compatibility Matrix

This matrix tracks, per browser/agent runtime, whether each Stash
agent-facing surface is verified working, and what evidence backs that
claim — an automated conformance/eval report id, or a dated manual
check. The goal is that "does this work on BrowserOS" has a citable
answer instead of a one-off manual poke.

## Matrix

| Runtime | `/s?p=` fetch (JSON/MD/TXT) | `/stashes` island | `?agent=json` | `?agent=markdown` | extension MCP |
|---|---|---|---|---|---|
| BrowserOS 148 | verified — `runtime-conformance-browseros.json`, 2026-08-24, all 5 `agent-runtime-conformance.spec` scenarios pass (`pnpm --filter @stash/e2e run test:browseros`) | verified — same report | verified — same report | verified — same report | verified — same report |
| Chrome + nanobrowser | blocked (automated) — `runtime-conformance-chrome.json`, 2026-08-24: signed/branded Google Chrome refuses `--load-extension`/`--disable-extensions-except` for unpacked extensions, so our extension can't be automated-loaded into real Chrome at all (independent of nanobrowser); only the manual POC script below can reach this runtime | blocked (automated) — same reason | blocked (automated) — same reason | blocked (automated) — same reason | blocked (automated) — same reason |
| Chrome + ChromeClaw | blocked (automated) — same branded-Chrome CLI restriction as above, see `runtime-conformance-chrome.json` | blocked (automated) — same reason | blocked (automated) — same reason | blocked (automated) — same reason | blocked (automated) — same reason |
| stock Chromium | verified — `runtime-conformance-stock-chromium.json`, 2026-08-24, all 5 `agent-runtime-conformance.spec` scenarios pass via Playwright's managed unbranded `channel: "chromium"` (`pnpm --filter @stash/e2e exec playwright test --grep runtime`) | verified — same report | verified — same report | verified — same report | verified — same report |
| Firefox | untested — Playwright cannot drive a stock Gecko binary, only its own patched build — manual checklist only, not yet run | untested — same | untested — same | untested — same | untested — same |
| Zen | untested — Playwright cannot drive a stock Gecko binary, only its own patched build — manual checklist only, not yet run | untested — same | untested — same | untested — same | untested — same |
| Claude Code | untested — no evidence yet | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model |
| Gemini web | untested — no evidence yet | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model |
| ChatGPT browsing | untested — no evidence yet | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model | blocked — not a browser-profile runtime — fetch-only, per plan tier model |

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
