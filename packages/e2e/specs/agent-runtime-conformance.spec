# Runtime Conformance

Minimal contract a browser runtime must satisfy to run this project's
agent-facing `/stashes` surface. Deliberately narrower than
`local-bridge.spec`: each scenario asserts only the ONE new capability
it adds on top of the previous scenario, so a runtime fork's failure
points straight at the missing capability instead of producing a wall
of unrelated red.

Precondition: the extension is built (`pnpm --filter stash-extension
run build`) and the viewer dev server is running on
`http://localhost:4321` (Playwright's `webServer` config). Run against
an alternate runtime via `pnpm --filter @stash/e2e run test:browseros`
(or any `BROWSER_EXECUTABLE_PATH`/`BROWSER_LABEL` pair).

## Extension loads
tags: runtime
* The browser is launched with the built Stash extension and the options page is open
* The resolved extension id is not the unknown-runtime fallback

## MCP seed path works
tags: runtime
* The browser is launched with the built Stash extension and the options page is open
* The agent connects to the extension MCP port
* The agent seeds the extension library with the canonical seed
* stash_list should return the seeded stashes

## Content script injects
tags: runtime
* The browser is launched with the built Stash extension and the options page is open
* The user sets localLibraryViewerEnabled to true
* The viewer server is running on localhost:4321
* The agent probes the postMessage bridge directly on /stashes

## Island reaches ready
tags: runtime
* The browser is launched with the built Stash extension and the options page is open
* The agent connects to the extension MCP port
* The agent seeds the extension library with the canonical seed
* The user sets localLibraryViewerEnabled to true
* The viewer server is running on localhost:4321
* The user navigates to /stashes
* The JSON island parses to a StashExport matching the seed

## Agent views render
tags: runtime
* The browser is launched with the built Stash extension and the options page is open
* The agent connects to the extension MCP port
* The agent seeds the extension library with the canonical seed
* The user sets localLibraryViewerEnabled to true
* The viewer server is running on localhost:4321
* The user navigates to /stashes
* The ?agent=json view returns the canonical StashExport shape
* The ?agent=markdown view contains each seeded title and URL

## Daemon rung: daemon-fed library materializes to the viewer
tags: runtime
The daemon rung of the ladder (plan W3): the daemon's seeded library
and the extension materialized view must carry the same canonical
library shape to the viewer. The daemon MCP surface is asserted first
(same frozen registry), then the extension-fed bridge drives the
viewer. Note: the full native-messaging pairing loop (browser-spawned
host) cannot run in a headless harness; the daemon-seed step asserts
the daemon surface, and the materialization is asserted through the
extension bridge which consumes the same canonical seed. Requires the
daemon binary: `go build -o /tmp/stash-daemon ./daemon/cmd/stash-daemon`.
* The stash daemon is running in serve mode
* The agent connects to the daemon stdio MCP surface
* The MCP tool list should contain all 8 daemon stash tools
* The agent seeds the daemon library with the canonical seed
* The browser is launched with the built Stash extension and the options page is open
* The agent connects to the extension MCP port
* The agent seeds the extension library with the canonical seed
* The user sets localLibraryViewerEnabled to true
* The viewer server is running on localhost:4321
* The user navigates to /stashes
* The JSON island parses to a StashExport matching the seed
* The ?agent=json view returns the canonical StashExport shape
