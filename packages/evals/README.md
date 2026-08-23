# @stash/evals

LLM eval harness for agent readability of Stash surfaces. Implements work
item W5 of the agent-readability hardening plan. Opt-in, never CI-blocking.

## What it does

Runs three evals against a locally booted viewer (`astro preview` on :4321,
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

Graders are deterministic string/JSON checks. No LLM judging.

## Usage

Preconditions: viewer built (`pnpm --filter stash-viewer run build`). The
runner boots `astro preview` itself if nothing is on :4321 and kills it on
exit.

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

Hard cap of 20 LLM requests per run (3 evals = 3 requests normally,
retries on 429/5xx included).

## Descoped

Eval 4 (MCP tool use via a stubbed relay loopback transport) was descoped
per the plan; evals 1-3 carry the value. If revived, the stub must sit at
the relay's loopback-socket boundary as a fake ChromePortTransport.

## Offline tests

`pnpm --filter @stash/evals run test` runs grader and budget-guard unit
tests with a mocked fetch. No network or API key needed.
