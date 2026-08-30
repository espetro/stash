# Stash authentication

Stash has **no authentication** in v1.

## Read endpoints

All decode/read surfaces are public and unauthenticated:

- `GET https://stash.illo.fyi/s?p=<payload>` (viewer decode, content negotiation)
- `GET https://s.illo.fyi/s/<id>` (short-link resolve)
- `GET https://s.illo.fyi/openapi.json`

## Write endpoints

Write endpoints on the shortener (`s.illo.fyi`) are **unauthenticated but
rate-limited per IP**:

- `POST /api/stash` - create a short link. ~5 req/min per IP per PoP.
- `DELETE /api/stash/<id>` - revoke a short link before TTL expiry.
- `POST /mcp` - MCP Streamable-HTTP. ~60 req/min.

Abuse is bounded by these per-IP rate limiters; HTTP 429 responses carry
`Retry-After`. Self-hosters who want stronger revocation auth can proxy the
endpoints behind their own gate.

## Local surfaces

The browser extension MCP surface (`stash-extension`, runtime port
`portName: "mcp"`) and the daemon (`stash-daemon`, stdio/native messaging) are
local-only and never exposed over the network.
