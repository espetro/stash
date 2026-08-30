# Stash Relay

The Cloudflare Worker in `apps/shortener` is deployed as **the Stash relay**:
a small, stateless, explicitly self-hostable service that stores opaque,
TTL-bound payloads behind 6-character short links. It never holds a library:
a stored entry is the encoded payload string plus creation/expiry timestamps,
nothing else.

All logic lives in `@stash/server-core` (runtime-agnostic over `unstorage`);
this app only wires Cloudflare bindings. Any runtime that can supply the
`StashServerConfig` ports (a `unstorage` `Storage`, an origin, a brotli
loader, optional rate limiting / telemetry) can host a relay.

## HTTP surface

- `POST /api/stash` — store a payload, returns `{ id, url, expiry, itemCount }`
- `GET /s/:id?format=json|md|txt` (or `Accept` negotiation) — fetch a stash;
  no format means a 302 into the viewer SPA (`#p=`)
- `DELETE /api/stash/:id` — revoke a short link before TTL expiry
- `POST /mcp`, `GET /mcp` — stateless Streamable-HTTP MCP server with the 3
  relay tools (`stash_create`, `stash_get`, `stash_decode`)
- `GET /.well-known/mcp-server-card` — agent discovery card
- `GET /health`

## TTL semantics

TTL is a property of a **relay upload**, not of stash creation: the daemon
never expires anything locally, only uploads do. The per-upload `ttl` (HTTP)
/ `ttlDays` (MCP) defaults from relay config (`defaultTtl`, default `7d`) and
is capped by `maxTtl` when configured.

## DELETE endpoint

`DELETE /api/stash/:id` removes the stored entry (204) or 404s if absent, so
a user can revoke a link before TTL expiry. There is **no auth in v1**: the
id is a 6-char base32 value (~30 bits, unguessable by enumeration at
internet scale) which acts as the shared secret. The residual brute-force
surface is bounded by the per-IP rate limiter. Self-hosters who want
stronger revocation auth can proxy the endpoint behind their own gate.

## Self-hosting

Deploy `apps/shortener` with your own Cloudflare account, or re-host the
logic on any runtime with `unstorage` drivers (memory, fs, Redis, …) via
`createStashServer` from `@stash/server-core`:

- omit `maxTtl` to allow the full 1d-30d upload range (hosted caps at `7d`)
- omit `telemetry` for zero outbound reporting
- rate limiting is optional; when a binding is present, write paths
  (`POST /api/stash`, `POST /mcp`, `DELETE`) **fail closed**: a degraded
  limiter blocks writes rather than admitting unbounded traffic. Missing
  bindings allow (relevant for self-hosters without one).

## Bindings (wrangler.toml)

- `STASH_KV` — KV namespace for short links (7-day TTL ceiling)
- `RL_STASH` — rate limit, 5/min per IP per PoP for `POST /api/stash`
- `RL_MCP` — rate limit, 60/min for `POST /mcp`
- `STASH_ANALYTICS` — optional Analytics Engine sink for anonymous
  aggregate counters

brotli-wasm is vendored (workerd forbids runtime wasm compilation); see the
`[alias]` and `[[rules]]` blocks.

## Commands

```bash
pnpm --filter @stash/shortener run test
pnpm --filter @stash/shortener exec wrangler deploy   # needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN
```
