# packages/server-core

Runtime-agnostic relay server logic (routes, MCP tools, rate limiting,
telemetry) shared by the Cloudflare relay worker. No Cloudflare or
DOM imports here; dependencies are injected via `StashServerDeps`.

## Key pieces

- `src/mcp.ts` — relay MCP tools (`stash_create`, `stash_get`,
  `stash_decode`) and the streamable-HTTP handler. The 8 frozen daemon
  tool names live in the extension and daemon; no mirror here.
- `src/routes.ts` — `POST /api/stash`, `DELETE /api/stash/:id`,
  `GET /s/:id`
- `src/ratelimit.ts` — fail-closed binding checks on write paths
  (POST /api/stash, POST /mcp, DELETE); missing binding allows
- `src/telemetry.ts` — anonymous aggregate counters only; no URLs,
  titles, or user identifiers

## Tests

```bash
pnpm --filter @stash/server-core run test
```
