# apps/extension

WXT-based cross-browser extension (Chrome + Firefox). Local-first:
stashes live in `browser.storage.local` (`lib/stash-store.ts`), and a
local MCP server (`lib/mcp/`) exposes tabs and the stash library to AI
agents over a Chrome runtime port named `stash-mcp`.

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
