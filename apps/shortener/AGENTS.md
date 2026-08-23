# apps/shortener

Cloudflare Worker providing opt-in short links (`POST /api/stash`,
`s/<id>`) and the hosted MCP endpoint (`POST /mcp`, discovery card at
`/.well-known/mcp-server-card`). All logic lives in
`@stash/server-core`; this app only wires bindings.

Short-link reads use the consolidated `?format=` API:
`GET /s/<id>?format=json|md|txt` (or `Accept` negotiation) returns the
decoded payload; an unknown `format` value is a `400` JSON error. The
legacy `.json`/`.md`/`.txt` suffix routes 301-redirect to the `?format=`
form for one release and are then removed.

The discovery card advertises **two** MCP surfaces under `servers[]`:

- `stash-shortener` — this worker, `transport: "streamable-http"`,
  `url: <origin>/mcp`.
- `stash-extension` — the browser extension's local MCP server,
  `transport: "extension-port"`, `portName: "mcp"`. No `url` (Chrome
  runtime port, not HTTP). See `apps/extension/lib/mcp/` and
  `apps/extension/AGENTS.md` for client wiring.

Legacy flat `url` / `transport` / `tools` fields at the top of the card
mirror the shortener entry and are kept for backwards compatibility with
existing agent integrations.

## Bindings (wrangler.toml)

- `STASH_KV` — KV namespace for short links (7-day TTL ceiling)
- `RL_STASH` — rate limit, 5/min per IP per PoP for `POST /api/stash`
- `RL_MCP` — rate limit, 60/min for `POST /mcp`
- `STASH_ANALYTICS` — optional Analytics Engine sink for anonymous
  aggregate counters

Rate limiting fails closed: a missing binding blocks the route rather
than allowing unlimited traffic. brotli-wasm is vendored (workerd forbids
runtime wasm compilation); see the `[alias]` and `[[rules]]` blocks.

## Commands

```bash
pnpm --filter @stash/shortener run test
pnpm --filter @stash/shortener exec wrangler deploy   # needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN
```
