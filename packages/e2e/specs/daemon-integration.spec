# Daemon Integration

The spawned stash-daemon binary as a real MCP tool surface over stdio
(plan W2). A headless JSON-RPC client drives the full frozen 8-tool
registry; assertions use the canonical EXTENSION_SEED shared with the
extension specs so parity between the two surfaces is copyable.

Precondition: the daemon binary is built:
`go build -o /tmp/stash-daemon ./daemon/cmd/stash-daemon`
(or point `STASH_DAEMON_BIN` at any build). No browser is attached;
`stash_snapshot_tabs` is asserted only in its absence case
(`no_browser_attached`); the positive path is owned by F4.

## Daemon tool discovery
* The stash daemon is running in serve mode
* The agent connects to the daemon stdio MCP surface
* The MCP tool list should contain all 8 daemon stash tools
* The MCP daemon tool set should match the frozen 8-tool registry

## Daemon seed, list, get and search round-trip
* The stash daemon is running in serve mode
* The agent seeds the daemon library with the canonical seed
* stash_list on the daemon should return the seeded stashes
* stash_get on the daemon should return a seeded stash with 3 items and title Docs deep dive
* stash_search on the daemon for "reading list" should return the matching seeded stash

## Daemon update and delete round-trip
* The stash daemon is running in serve mode
* The agent seeds the daemon library with the canonical seed
* stash_update on the daemon should change the stash title
* stash_delete on the daemon should remove the stash

## Daemon error paths
* The stash daemon is running in serve mode
* stash_snapshot_tabs on the daemon should report no_browser_attached
* stash_get on the daemon with an unknown id should return not_found
* stash_update on the daemon with an unknown id should return not_found
* stash_delete on the daemon with an unknown id should return not_found
* stash_decode on the daemon with a malformed payload should return a decode error
