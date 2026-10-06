# Agent-eval suite vNext + agent-surface improvements

Plan distilled from two research tracks (2026-10-05): a tool-eval
methodology survey and a user-data/telemetry assessment. Full findings:
`~/stash-eval-tooling-research.md`, `~/stash-user-data-assessment.md`
(session artifacts; key points duplicated here).

## Model panel (recommended, OpenRouter free/cheap tiers)

Validated 2026-10-05 on branch `devin/1791300000-agent-first-benchmark`:

| model | tier | run result |
|---|---|---|
| `openai/gpt-5-nano` | $0.05/M in | **10/10**, 16 calls, 28s mean — fewest calls |
| `openai/gpt-oss-120b` | $0.037/M in | 9/10 — decrypt fails (family limit, same as 20b) |
| `nvidia/nemotron-3-super-120b-a12b:free` | free | 9/10 — decrypt passes; misses `format=json` |
| `openai/gpt-4o-mini` | $0.15/M in | 10/10, ~7s mean (existing baseline) |
| `openai/gpt-oss-20b` | free | ~9/10 — decrypt fails, flaky structured output |
| `inclusionai/ling-3.1-flash` | free | upstream 429s — retry when capacity returns |

Sweep: `EVAL_MODELS=a,b,c pnpm --filter @stash/evals run eval`.

## Suite vNext (harness)

1. **pass^k**: run each eval k=4-8× per model, report pass^1 and pass^k +
   per-eval variance — cheap-model flakiness IS the signal (τ-bench,
   MCPMark: gpt-5 scored 52.6% pass^1 but 33.9% pass^4).
2. **Token cost in reports** — done (promptTokens/completionTokens per
   eval + run totals).
3. **Trajectory diagnostic, never a gate**: log expected-vs-actual fetch
   sequence for triage (τ-bench `partial_action_reward` style); keep
   end-state grading as the score.
4. **Held-out variants**: paraphrased prompts + different fixture titles so
   llms.txt/tool-description edits can't overfit (Anthropic held-out-set).
5. **Failure taxonomy over transcripts** before any surface fix
   (Hamel Husain's eval loop) — classify, fix once, verify once.
6. **Errors that teach**: extend fetch_url's hint pattern — 400 on bad
   `format=` should name the valid enum; expired payload should explain
   expiry semantics; 429 should state retry-after.

## Agent-surface vNext (product)

1. **`Link: rel="alternate" type="application/json"` header** on `/s` HTML
   responses — negotiation discoverable without parsing HTML.
2. **MCP per-tool telemetry** (`tool`/`isError`/`errorKind` Analytics
   Engine blobs) + `durationMs` — per-tool error rates drive
   tool-description fixes, where tool-call efficiency is actually won.
3. **SPA beacons**: `fragment_present`, `decode_failed`, `decrypt_failed`
   (event names only, inside existing `/beacon` allowlist +
   `telemetryEnabled` envelope) — client-side decrypt failures are
   server-invisible today.
4. **Coarse `agentUaFamily`** (mcp-sdk/httpx/curl/mozilla/other) next to
   `classifyClient` — never raw UA strings.
5. **Synthetic traffic generator** (weekly): 2–3 cheap models + one real
   MCP client hitting prod `/s`, `/s/:id`, `/mcp` on scripted tasks —
   real UA + arg shapes with zero consent surface; doubles as a prod
   regression alarm.

## Privacy / telemetry decision (from user-data assessment)

- **Done**: PostHog `disable_capture_url_hashes` — was shipping whole
  `#p=` payloads to PostHog EU on every `/s` pageview.
- Worth it narrowly: instrument the already-built aggregate telemetry
  (Analytics Engine is CNIL-exemption-shaped: no IDs, no content) +
  synthetic agent traffic; skip user tracking — real-user volume is too
  thin to design evals around.
- Off-limits forever: `p=`/`#p=` values, stash ids joined to dims, IPs,
  raw UAs, per-session identifiers, hosted MCP analytics gateways
  (`stash_create` args ARE stash contents → proxying breaks zero-trust),
  Workers Logs/Logpush (capture `?p=` plaintext — needs redaction pipeline
  first, revisit only if traffic justifies).

## References

BFCL v4 (structure > phrasing: JSON-schema docs + JSON returns win),
τ-bench (end-state grading, pass^k), MCPMark/MCP-Universe (pinned servers,
programmatic verification), WebArena (harness is a first-class variable —
14.4%→25.4% on harness change alone), Anthropic tool-eval playbook
(error messages that teach, consolidated tools, return names not IDs),
Cloudflare/Stripe/Vercel agent-surface checklists.
