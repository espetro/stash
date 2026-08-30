---
screen: extension-3
name: My Stashes (popup)
route: extension popup, stashes view
file: apps/extension/entrypoints/popup/components/StashesView.tsx
---

```text
+--------------------------------------------------+
| [<] Stash                (archive) (clock) (cog) |
+--------------------------------------------------+
| My Stashes                        (export) (import)|
| [ Search by title, tag, or note... ]             |
| +----------------------------------------------+ |
| | v Untitled stash            (trash)          | |
| |   3 items · Aug 22, 2026 10:04              | |
| |   [tag] [tag]                                | |
| +----------------------------------------------+ |
| | > Another stash              (trash)         | |
| +----------------------------------------------+ |
+--------------------------------------------------+
```

Expanded stash item (`StashItem.tsx`):

```text
| v Stash title                        (trash)    |
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
| Search | only when stashes exist | Filters by title, note, tags |
| Stash row | collapsed / expanded | Chevron + title (or "Untitled stash") + "N items · date" + tag chips; expanding fires `stash_reopened` |
| Trash | one-click arm, 3s window | Second click deletes; title flips to "Click again to confirm" |
| Title / Tags / Note editors | expanded | Inline inputs, saved on blur; tag editor has remove-x per chip, input plus LuPlus add button (Enter also adds) |
| Items list | expanded | Plain links opening in new tab |
| Empty state | no stashes / no match | LuArchive icon + "No stashes yet" / "No matching stashes" |

## Behavior

- Stashes sorted by `updatedAt` descending.
- Back chevron returns to the main selection view.
- Import errors surface through the shared `ErrorMessage` banner.
ts, saved on blur; tag editor has remove-x per chip, input plus LuPlus add button (Enter also adds) |
| Items list | expanded | Plain links opening in new tab |
| Empty state | no stashes / no match | LuArchive icon + "No stashes yet" / "No matching stashes" |

## Behavior

- Stashes sorted by `updatedAt` descending.
- Back chevron returns to the main selection view.
- Import errors surface through the shared `ErrorMessage` banner.
