# Agent Runtime Compatibility Matrix

This matrix tracks, per browser/agent runtime, whether each Stash
agent-facing surface is verified working, and what evidence backs that
claim — an automated conformance/eval report id, or a dated manual
check. The goal is that "does this work on BrowserOS" has a citable
answer instead of a one-off manual poke.

## Matrix

| Runtime | `/s?p=` fetch (JSON/MD/TXT) | `/stashes` island | `?agent=json` | `?agent=markdown` | extension MCP |
|---|---|---|---|---|---|
| BrowserOS 148 | untested — pending: `packages/e2e/specs/agent-runtime-conformance.spec` (`@runtime` tag) and `packages/evals` island-extraction/negative-fetch-only evals not yet executed against this runtime — see `runtime-conformance.json` and eval report once produced | untested — same pending run | untested — same pending run | untested — same pending run | untested — same pending run |
| Chrome + nanobrowser | untested — pending: `packages/e2e/specs/agent-runtime-conformance.spec` (`@runtime` tag) and `packages/evals` island-extraction/negative-fetch-only evals not yet executed against this runtime — see `runtime-conformance.json` and eval report once produced | untested — same pending run | untested — same pending run | untested — same pending run | untested — same pending run |
| Chrome + ChromeClaw | untested — pending: `packages/e2e/specs/agent-runtime-conformance.spec` (`@runtime` tag) and `packages/evals` island-extraction/negative-fetch-only evals not yet executed against this runtime — see `runtime-conformance.json` and eval report once produced | untested — same pending run | untested — same pending run | untested — same pending run | untested — same pending run |
| stock Chromium | untested — pending: `packages/e2e/specs/agent-runtime-conformance.spec` (`@runtime` tag) and `packages/evals` island-extraction/negative-fetch-only evals not yet executed against this runtime — see `runtime-conformance.json` and eval report once produced | untested — same pending run | untested — same pending run | untested — same pending run | untested — same pending run |
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
