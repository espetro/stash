---
screen: extension-3
name: Library (popup)
route: extension popup, stashes view
file: apps/extension/entrypoints/popup/components/StashesView.tsx
---

```text
+--------------------------------------------------+
| [<] Stash                         (library) (cog) |
+--------------------------------------------------+
| Library                           (export) (import)|
| [ All · N ] [ Kept · N ] [ Recent · N ]         |
| [ Search by title, tag, or note... ]             |
| +----------------------------------------------+ |
| | v Example + 1 more    [Recent · expires in…]  | |
| |   [Share] [Keep] [trash]                      | |
| |   3 items · Aug 22, 2026 10:04              | |
| |   [tag] [tag] [Shared 1 time]                 | |
| +----------------------------------------------+ |
| | > Kept stash                         [Share] [trash] |
| +----------------------------------------------+ |
+--------------------------------------------------+
```

Expanded stash item (`StashItem.tsx`):

```text
| v Stash title  [Recent · expires in…]            |
|   [Share] [Keep] [trash]                         |
|   Title  [ Untitled stash ]                      |
|   Tags   [tag x] [tag x] [ Add tag... ] (+)      |
|   Note   [ Add a note... ]                       |
|   Items  - https://example.com/page (link)       |
+--------------------------------------------------+
```

## Elements

| Element | State | Description |
|---|---|---|
| Sync status line | hidden when paired & drained | Persistent status surface (`SyncStatusBar`); variants: never paired, offline (with last seen), protocol refused, pending backlog. Error copy names `stash-daemon doctor`. Popup saving/sharing fully functional in every state. |
| Export icon | header, disabled when empty | LuDownload, downloads `stash-export-<ts>.json`; fires `export_used` |
| Import icon | header | LuUpload, opens hidden file input (JSON only); fires `import_used`, skips existing ids |
| Filter chips | when stashes exist | All / Kept / Recent, each with a count; All is selected initially |
| Search | only when stashes exist | Filters by title, note, tags after applying the selected filter |
| Stash row | collapsed / expanded | Chevron + title fallback + item count/date, Recent expiry badge, optional shared count and tags; expanding fires `stash_reopened` |
| Share | every row | Encodes with current settings, copies the URL, records history and attaches the share to the same Library record |
| Keep | Recent rows only | Changes the row to Kept |
| Trash | one-click arm, 3s window | Second click deletes; title flips to "Click again to confirm" |
| Title / Tags / Note editors | expanded | Inline inputs, saved on blur; tag editor has remove-x per chip, input plus LuPlus add button (Enter also adds) |
| Items list | expanded | Plain links opening in new tab |
| Empty state | no stashes / no match | LuArchive icon + "No stashes yet" / "No matching stashes" |

## Behavior

- Stashes sorted by `updatedAt` descending within the selected filter.
- Back chevron returns to the main selection view.
- Import errors surface through the shared `ErrorMessage` banner.
ts, saved on blur; tag editor has remove-x per chip, input plus LuPlus add button (Enter also adds) |
| Items list | expanded | Plain links opening in new tab |
| Empty state | no stashes / no match | LuArchive icon + "No stashes yet" / "No matching stashes" |

## Behavior

- Stashes sorted by `updatedAt` descending.
- Back chevron returns to the main selection view.
- Import errors surface through the shared `ErrorMessage` banner.
