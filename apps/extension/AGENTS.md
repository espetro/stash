# apps/extension

WXT-based cross-browser extension (Chrome + Firefox). Local-first:
stashes live in `browser.storage.local` (`lib/stash-store.ts`), and a
local MCP server (`lib/mcp/`) exposes tabs and the stash library to AI
agents over a Chrome runtime port named `mcp`.

User-facing screens are mapped in `.agents/docs/screens/` (see
`screen-extension-*.md`); update them when popup or options UI changes.

## Icons

`react-icons` Lucide only (`react-icons/lu`).

## Commands

```bash
pnpm --filter stash-extension run dev    # dev mode
pnpm --filter stash-extension run test   # vitest (jsdom)
pnpm --filter stash-extension run build  # chrome + firefox zips
```

`VITE_VIEWER_ORIGIN` controls the origin embedded in generated share
links.

## Gotchas

- Manifest V3: no network listeners in the background; MCP goes over
  runtime ports, not HTTP.
- The old `experimentalServer` bridge (content-script relay, fetch
  bridge) was removed; do not reintroduce it.

## Local MCP / `stash-mcp-relay`

Stash exposes its background MCP server (`lib/mcp/`) on the runtime
port named `mcp` (constant: `lib/mcp/constants.ts`). Stdout MCP
clients (Claude Desktop, Cursor) can talk to it through the
[`@stash/mcp-relay`](../../packages/mcp-relay/) package, which
bridges the parent's stdio to a local loopback socket the extension
exposes.

The relay binary is intentionally trust-local-user: no auth, no
token, no signed handshake. The parent MCP client (Claude Desktop,
Cursor) already enforces that the relay code shipped alongside this
extension is the relay it spawns; the extension itself only opens a
loopback port, so no external party can reach it. (Decision recorded
in the planning sheet; this is a stop-gap until PR6's signed-channel
work lands.)

The extension's `externally_connectable.matches` includes
`http://127.0.0.1/*` and `http://localhost/*` so the relay can
attach if it ever moves to a browser-page bridge instead of a raw
TCP socket — currently the relay uses the latter, so the manifest
allowance is forward-compatible rather than load-bearing.

### Wiring a fresh client

```sh
# 1. Install the relay in the extension's tree (or as a dev dep)
pnpm --filter @stash/mcp-relay install

# 2. Tell the relay which loopback port the extension listens on:
export STASH_RELAY_PORT=4317

# 3. Point your MCP client at the binary, e.g. in
#    claude_desktop_config.json:
#    {
#      "mcpServers": {
#        "stash": { "command": "npx",
#                   "args": ["-y", "@stash/mcp-relay"] }
#      }
#    }
```

The relay exits with a clear error if `STASH_RELAY_PORT` is unset.
PR6 will land the extension-side socket; today the relay is
shippable but only the trust-local plumbing is wired.
