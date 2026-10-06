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

## Local MCP

Stash exposes its background MCP server (`lib/mcp/`) on the runtime
port named `mcp` (constant: `lib/mcp/constants.ts`). This is a
browser-internal transport: desktop MCP clients (Claude Desktop,
Cursor) cannot reach the extension directly.

For local MCP access, desktop clients talk to the **Stash daemon**
over stdio (see the daemon in `daemon/`); the daemon reaches the
extension over native messaging. The old stdio relay package has
package has been removed from the tree (local-first re-platform spec,
[`.agents/docs/local-first-replatform-spec.md`](../../.agents/docs/local-first-replatform-spec.md),
section 10.4).

The extension's `externally_connectable.matches` still includes
`http://127.0.0.1/*` and `http://localhost/*` for local development
against the in-extension MCP server; the allowlist is not load-bearing
for any shipped integration.
