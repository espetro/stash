# Agent Flow Extension

Headless MCP client against the extension's runtime port named "mcp",
spoken from the options page exactly like MCP-B or the relay would.
Precondition: the extension is built
(pnpm --filter stash-extension run build) and Playwright's chromium
browser is installed.

Daemon parity (plan W3): the last two scenarios run the same discovery
and seed round-trip against the daemon's stdio MCP surface
(helpers/mcp-daemon.ts) side by side with the extension scenarios, so
the two surfaces are asserted against the same canonical seed and the
same frozen tool registry. Prerequisite for those scenarios:
`go build -o /tmp/stash-daemon ./daemon/cmd/stash-daemon`.

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

## Share tabs and keep the Recent stash in the Library
* The browser is launched with the built Stash extension and the options page is open
* A new tab is opened with URL "https://example.com/research-one"
* The tab title is "Research tab one"
* A new tab is opened with URL "https://example.org/research-two"
* The tab title is "Research tab two"
* The user clicks the extension icon
* The popup should open
* The popup should display 2 tabs
* The user clicks Select All
* The user shares the selected tabs from the popup
* The popup should show the link result
* The user opens the Library from the popup
* The Library should show one Recent row and zero Kept stashes
* The user keeps the Recent row in the Library
* The user filters the Library to Kept
* The kept share should appear in the Library
* The popup is closed

## Daemon tool discovery parity
* The stash daemon is running in serve mode
* The agent connects to the daemon stdio MCP surface
* The MCP tool list should contain all 8 daemon stash tools
* The MCP daemon tool set should match the frozen 8-tool registry

## Daemon seed, list, get and search parity
* The stash daemon is running in serve mode
* The agent seeds the daemon library with the canonical seed
* stash_list on the daemon should return the seeded stashes
* stash_get on the daemon should return a seeded stash with 3 items and title Docs deep dive
* stash_search on the daemon for "reading list" should return the matching seeded stash
