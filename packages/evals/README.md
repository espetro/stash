# @stash/evals

LLM eval harness for agent readability of Stash surfaces. Implements work
item W5 of the agent-readability hardening plan. Opt-in, never CI-blocking.

## What it does

Runs six evals against a locally booted viewer (`astro preview` on :4321,
fronted by a loopback server that runs the REAL Pages Function handler from
`apps/viewer/functions/s.ts`, since `astro preview` does not execute Pages
Functions) and an in-process shortener (`createStashServer` on an ephemeral
port):

1. `decode-comprehension` — model gets a share URL plus llms.txt and must
   report the link count and domains. Graded against the `three-tabs`
   fixture ground truth.
2. `format-discovery` — model must return the JSON endpoint URL for the
   stash (`/s?p=...&format=json` or the Accept negotiation variant).
3. `short-link-read` — model must read a short link (`/s/:id`) and list
   every URL it contains.
4. `alternate-link-discovery` — regression test for the `/s` page's
   `<link rel="alternate">` href resolving to `localhost` instead of the
   configured production viewer origin. Gives the model the raw HTML the
   local preview server emits and asks it to fetch the stash as JSON;
   passes iff the model's fetch lands on the production-style origin.
5. `negative-fetch-only` — fetch-only agent asked to "list the stashes
   saved in this browser" must recognize `/stashes` is a profile-local,
   client-rendered surface it cannot read via plain HTTP (or fall back to
   `/s?p=...`), rather than hallucinating a listing.
6. `island-extraction` — DOM-tier eval. Drives a real Playwright browser
   context with the extension loaded and seeded (same setup as the e2e
   agent-flow/local-bridge suite), hands the model exactly three tools
   (`navigate`, `read_dom`, `answer`) and the bare natural-language task
   with no selector hints, and grades whether the model's final answer
   matches the seeded extension library. Tests whether llms.txt plus raw
   DOM exploration is self-describing enough to find `#stash-local-export`
   on its own.

Graders are deterministic string/JSON checks. No LLM judging.

### Port collision with the e2e suite

`island-extraction` reuses the same `:4321` `astro preview` server as the
other evals (via `bootViewer()`), and the extension's local-bridge origin
allowlist (`LOCAL_LIBRARY_VIEWER_ORIGINS` in `apps/extension/lib/settings.ts`)
is pinned to that port, so it cannot simply move to a different one. This is
the same port `packages/e2e/playwright.config.ts` binds for the e2e suite.
**Do not run `pnpm eval:agents` and `pnpm --filter @stash/e2e run test`
concurrently** — they will fight over `:4321`.

## Usage

Preconditions: viewer built (`pnpm --filter stash-viewer run build`). The
runner boots `astro preview` itself if nothing is on :4321 and kills it on
exit. `island-extraction` additionally requires the extension built
(`pnpm --filter stash-extension run build`, producing
`apps/extension/.output/chrome-mv3`) — it launches a real Chromium context
with that build loaded.

```bash
pnpm eval:agents
```

Writes `report.json` (gitignored): per-eval pass/fail, served model
(`x-or-model` header), prompt, response. Exits nonzero if any eval fails,
printing failures with model + prompt for triage.

## Env vars (root `.env`)

- `OPENROUTER_API_KEY` — required for live runs
- `OPENROUTER_MODEL_ID` — defaults to `nvidia/nemotron-3-super-120b-a12b:free`.
  `openrouter/free` (the router alias in root `.env`) rotates through weak or
  moderation-only models and flunks eval 1; pin a concrete `:free` slug.

## Budget guard

Hard cap of 20 LLM requests per run (6 evals = 6+ requests normally, more
for evals with multi-round tool loops like `island-extraction`; retries on
429/5xx included).

## Descoped

A standalone MCP tool-use eval (via a stubbed relay loopback transport) was
descoped per the original plan; `island-extraction` now covers the
DOM/extension surface end to end instead. If a pure-MCP eval is revived, the
stub must sit at the relay's loopback-socket boundary as a fake
ChromePortTransport.

## Offline tests

`pnpm --filter @stash/evals run test` runs grader and budget-guard unit
tests with a mocked fetch. No network or API key needed.
