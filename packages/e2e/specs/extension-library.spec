# Extension Library page

Covers PR E: the unlisted `library.html` page hosts the full library
(All/Kept/Recent rows, search, share, QR, open-all, sync status and the
never-paired backup hint) plus the `#settings` tab that replaced the
options page, and the `#pending-import` banner that lands the
viewer→extension handoff. The popup is collection-only; the viewer
`/stashes` page detects the extension via the always-on presence ping.

## Library page renders seeded rows, actions, and the settings tab
* The browser is launched with the built Stash extension and the options page is open
* The agent connects to the extension MCP port
* The agent seeds the extension library with the canonical seed
* The user opens the Library page directly
* The Library should show 3 seeded rows
* The Library should show the not-backed-up hint
* The Library row should open the QR dialog
* The Library settings tab should render

## Viewer /stashes presence CTA and one-time handoff
* The browser is launched with the built Stash extension and the options page is open
* The viewer server is running on localhost:4321
* The user navigates to /stashes
* The /stashes page should show the extension CTA
* The user seeds a viewer-local stash
* The user moves the viewer-local records to the extension
* The viewer-local stash storage should be cleared
* The pending-import banner should be visible
* The user confirms the pending import
* The Library should show 1 seeded rows
