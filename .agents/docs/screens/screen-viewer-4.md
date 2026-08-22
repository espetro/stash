---
screen: viewer-4
name: My Stashes (viewer)
route: /stashes
file: apps/viewer/src/components/MyStashes.tsx
---

```text
+--------------------------------------------------------------+
| [<]          + New stash   My stashes   (theme) (lang)       |
+--------------------------------------------------------------+
| + My Stashes ------------------------------------------------+ |
| | [(search) Search by title, tag or note            ]        | |
| | +------------------------------------------------------+   | |
| | | Stash title                          (pen) (trash)  |   | |
| | | [tag] [tag]                                          |   | |
| | | 3 items · Aug 22, 2026 10:04                         |   | |
| | +------------------------------------------------------+   | |
| | | (expanded) note text                 <- optional     |   | |
| | |   favicon Title  domain              (per item)      |   | |
| | +------------------------------------------------------+   | |
| | (empty: "No stashes yet" dashed box)                      | |
| | import result caption (3s)                                | |
| +------------------------------------------------------------+ |
|              [ + New stash ]   (primary, full width)          |
|                    (export)  (import)                         |
+--------------------------------------------------------------+
```

## Elements

| Element | State | Description |
|---|---|---|
| AppHeader | always | Back chevron, New stash / My stashes links, theme and language |
| Search | always | FaMagnifyingGlass icon inside the input; filters the library |
| Stash card | collapsed / expanded | Title (or "Untitled"), tag chips, "N items · date"; expanding fires `stash_reopened` |
| Edit (pen) | opens StashEditForm | Inline Title / Tags / Note inputs with Save and Cancel buttons |
| Delete (trash) | opens confirm dialog | Dialog with Cancel and a red destructive confirm button |
| Item rows | expanded | `TabListItem` per item, note items included |
| Empty state | no records | Dashed-border centered paragraph |
| Import caption | 3s after import | Success ("N imported") or error message |
| New stash | primary, full width | FaPlus label; navigates to `/s/new` |
| Export | outline, icon-only (size-10) | FaFileArrowDown, downloads library JSON |
| Import | outline, icon-only (size-10) | FaFileArrowUp, triggers hidden file input (JSON) |

## Behavior

- Fires `stash_list_viewed` on mount and `stash_reopened` when a card is
  first expanded.
- Delete is a two-step flow inside a Dialog (no arm timer, unlike the
  extension popup).
- The hidden `<input type="file">` sits at the page root; import feedback
  shows as a caption for 3 seconds.
