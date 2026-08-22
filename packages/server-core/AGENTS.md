# packages/server-core

Runtime-agnostic stash server logic (routes, MCP tools, rate limiting,
telemetry) shared by the Cloudflare shortener worker. No Cloudflare or
DOM imports here; dependencies are injected via `StashServerDeps`.

## Key pieces

- `src/mcp.ts` — hosted MCP tools (`stash_create`, `stash_get`,
  `stash_decode`) and the streamable-HTTP handler
- `src/routes.ts` — `POST /api/stash`, `GET /s/:id`
- `src/ratelimit.ts` — fail-closed binding checks (missing binding
  blocks, never allows)
- `src/telemetry.ts` — anonymous aggregate counters only; no URLs,
  titles, or user identifiers

## Tests

```bash
pnpm --filter @stash/server-core run test
```
