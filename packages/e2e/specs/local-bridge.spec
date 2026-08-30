# Local Bridge

End-to-end coverage of the W4 surface: the viewer's `/stashes` page
acts as a read-only bridge between browser-class agents and the
extension's profile-local stash library, gated by the
`localLibraryViewerEnabled` opt-in. Fetch-only agents must NOT see
extension records, and the extension records must NEVER reach
viewer-localStorage or IndexedDB.

Precondition: the extension is built (`pnpm --filter stash-extension
run build`) and the viewer dev server is running on
`http://localhost:4321` (Playwright's `webServer` config).

## Bridge enabled — extension library surfaced on /stashes
* The browser is launched with the built Stash extension and the options page is open
* The agent connects to the extension MCP port
* The agent seeds the extension library with the canonical seed
* The user sets localLibraryViewerEnabled to true
* The viewer server is running on localhost:4321
* The user navigates to /stashes
* The page source chip should be extension
* The page should show 3 stashes
* The JSON island parses to a StashExport matching the seed
* The ?agent=json view returns the canonical StashExport shape
* The ?agent=markdown view contains each seeded title and URL
* Reloading the page reflects the updated extension record

## Bridge disabled — viewer localStorage unchanged
* The browser is launched with the built Stash extension and the options page is open
* The user sets localLibraryViewerEnabled to false
* The viewer server is running on localhost:4321
* The user navigates to /stashes
* The page source chip should be viewer-local
* The JSON island parses to an empty viewer-local StashExport

## No-persistence assertion
* The browser is launched with the built Stash extension and the options page is open
* The agent connects to the extension MCP port
* The agent seeds the extension library with the canonical seed
* The user sets localLibraryViewerEnabled to true
* The viewer server is running on localhost:4321
* The user navigates to /stashes
* viewer localStorage contains no extension record titles or URLs
* viewer IndexedDB contains no extension stash titles or URLs

## Fetch-only baseline
* The viewer server is running on localhost:4321
* A plain GET of /stashes returns an HTML shell with no extension records
* A hosted /s decode with format json returns the canonical payload

## Bridge fed by the daemon materialized view
The daemon scenario (plan W3): the daemon's seeded library reaches the
extension through the F5 sync client and the bridge, sharing the same
canonical seed as the extension-fed scenarios. Note: the full
native-messaging pairing loop (browser-spawned host) cannot run in a
headless harness, so this scenario asserts surface parity instead — the
daemon library is seeded over its stdio MCP surface with the same
canonical seed, the extension bridge carries the seed over the
postMessage channel, and both must report identical materialized data.
Requires the daemon binary:
`go build -o /tmp/stash-daemon ./daemon/cmd/stash-daemon`.
* The stash daemon is running in serve mode
* The agent seeds the daemon library with the canonical seed
* The browser is launched with the built Stash extension and the options page is open
* The agent connects to the extension MCP port
* The agent seeds the extension library with the canonical seed
* The user sets localLibraryViewerEnabled to true
* The viewer server is running on localhost:4321
* The user navigates to /stashes
* The page source chip should be extension
* The JSON island parses to a StashExport matching the seed
* viewer localStorage contains no extension record titles or URLs
* viewer IndexedDB contains no extension stash titles or URLs
