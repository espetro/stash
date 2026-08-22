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
| Cancel | always | DrawerClose ghost button |

## Behavior

- Each copy action flips its label to "Copied!" for 2 seconds and closes
  the drawer immediately after copying.
- Operates on the current (possibly edited) item list passed from the tab
  viewer, not the original payload.
