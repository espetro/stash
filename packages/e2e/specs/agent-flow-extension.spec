# Agent Flow Extension

Headless MCP client against the extension's runtime port named "mcp",
spoken from the options page exactly like MCP-B or the relay would.
Precondition: the extension is built
(pnpm --filter stash-extension run build) and Playwright's chromium
browser is installed.

## MCP tool discovery and snapshot
* The browser is launched with the built Stash extension and the options page is open
* The agent connects to the extension MCP port
* The MCP tool list should contain all 8 stash tools
* The agent calls stash_snapshot_tabs and receives the current window tabs

## Seed, list, get and search round-trip
* The browser is launched with the built Stash extension and the options page is open
* The agent connects to the extension MCP port
* The agent seeds the extension library with the canonical seed
* stash_list should return the seeded stashes
* stash_get should return a seeded stash with 3 items and title Docs deep dive
* stash_search for "reading list" should return the matching seeded stash
