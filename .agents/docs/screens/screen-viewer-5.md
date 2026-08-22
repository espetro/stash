---
screen: viewer-5
name: ShareDrawer dialog
route: viewer, bottom drawer opened from the tab viewer split button dropdown
file: apps/viewer/src/components/ShareDrawer.tsx
---

```text
+--------------------------------------------------+
|                  Export Options                  |
|            Choose how to format your links       |
|                                                  |
| +----------------------------------------------+ |
| | Share as JSON                                | |
| | Raw data format for developers               | |
| +----------------------------------------------+ |
| +----------------------------------------------+ |
| | Share as Markdown                            | |
| | Formatted list with links                    | |
| +----------------------------------------------+ |
| +----------------------------------------------+ |
| | Copy as agent URL                            | |
| | ?p=<payload> form for curl + agents          | |
| +----------------------------------------------+ |
|                  [ Cancel ]                     |
+--------------------------------------------------+
```

Bottom-direction drawer (vaul), centered with max width on sm+ screens.

## Elements

| Element | State | Description |
|---|---|---|
| Drawer title | always | "Export Options" with description "Choose how to format your links" |
| Share as JSON | default or "Copied!" | Copies JSON export of the decoded data to the clipboard |
| Share as Markdown | default or "Copied!" | Copies a Markdown link list |
| Copy as agent URL | default or "Copied!" | Copies `<origin>/s?p=<encoded>` (the encoded share payload moved from fragment to query) so fetch-only agents can consume it |
| Cancel | always | DrawerClose ghost button |

## Behavior

- Each copy action flips its label to "Copied!" for 2 seconds and closes
  the drawer immediately after copying.
- Operates on the current (possibly edited) item list passed from the tab
  viewer, not the original payload.
- The Agent URL copy reads the encoded payload from `window.location.hash`
  (`#p=...`) and rewrites it to `?p=...` against the current origin.
