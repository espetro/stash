---
screen: extension-3
name: Library page
route: extension page `library.html` (unlisted; opened from popup "Open Library", the `/stashes` CTA, or browser "Extension options" → `#settings`)
file: apps/extension/entrypoints/library/App.tsx, entrypoints/library/components/LibraryView.tsx
---

```text
+----------------------------------------------------------+
| Stash Library          [ Library ] [ Settings ]   (tabs) |
+----------------------------------------------------------+
| (import banner) N stashes from the Stash website are     |
|   ready to import into this profile's library.           |
|   [ Import ]  [x]                                        |
+----------------------------------------------------------+
| (sync bar — hidden when paired & drained)                |
| (backup hint — only while never paired)                  |
|   Not backed up: this library only lives in this browser |
|   profile. Install the Stash daemon or export a copy.    |
+----------------------------------------------------------+
| Library                        (export) (import)         |
| [ All · N ] [ Kept · N ] [ Recent · N ]                  |
| [ Search by title, tag, or note... ]                     |
| +------------------------------------------------------+ |
| | v Example + 1 more [Recent · clears in Xd…]           |
| |   [Share] (qr) (open-all) [Keep] [trash]              |
| |   3 items · Aug 22, 2026 10:04                        |
| |   [tag] [tag] [Shared 1 time]                         |
| +------------------------------------------------------+ |
| | > Kept stash             [Share] (qr) (open-all) [trash] |
| +------------------------------------------------------+ |
+----------------------------------------------------------+
```

Expanded stash item (`components/library/StashItem.tsx`):

```text
| v Stash title [Recent · clears in Xd…]                   |
|   [Share] (qr) (open-all) [trash]                        |
|   Title  [ Untitled stash ]                              |
|   Tags   [tag x] [tag x] [ Add tag... ] (+)              |
|   Note   [ Add a note... ]                               |
|   Shares (expanded) — url · date · N tabs · time left    |
|   Items  - https://example.com/page (link)               |
+----------------------------------------------------------+
```

QR dialog (`QrDialog.tsx`, native `<dialog>`):

```text
+--------------------------------------------------+
|              +----------------+                  |
|              |    QR code     |                  |
|              +----------------+                  |
| https://viewer.example.com/s#p=... (mono, wraps) |
| [ x Close ]                                      |
+--------------------------------------------------+
```

## Elements

| Element | State | Description |
|---|---|---|
| Library/Settings tabs | always | Hash-routed (`#library` / `#settings`); `#pending-import` lands on Library and shows the import banner |
| Pending-import banner | only when `pending-import` storage slot set | viewer→extension handoff confirm surface; Import merges records + clears slot; Dismiss clears slot |
| Sync status line | hidden when paired & drained | `SyncStatusBar`; never-paired / offline / refused / backlog variants. The extension id and a "Copy install command" button (copying `stash-daemon install --chrome-id <id>`, plain `stash-daemon install` on Firefox) show in the never-paired variant and in the offline variant when the daemon was never seen (`offline` with no `lastSeenAt`) — Chrome persists `offline` on first connectNative drop, so a never-paired user typically lands in the offline variant. Error copy names `stash-daemon doctor`. Popup saving/sharing fully functional in every state. |
| Backup hint | only when `state === "disconnected"` | "Not backed up … Install the Stash daemon or export a copy" |
| Export icon | header, disabled when empty | LuDownload, downloads `stash-export-<ts>.json`; fires `export_used` |
| Import icon | header | LuUpload, opens hidden file input (JSON only); fires `import_used`, skips existing ids |
| Filter chips | when stashes exist | All / Kept / Recent, each with a count |
| Search | only when stashes exist | Filters by title, note, tags within the selected filter |
| Stash row | collapsed / expanded | Chevron + title + item count/date, `Recent · clears in …` badge, shared count, tags |
| Share | every row | Encodes with current settings, copies URL, records history + attaches share to the record; `Copied!` 2s |
| QR | every row | LuQrCode icon button; encodes the same share link (records history + share) and opens the QR dialog; fires `stash_qr_shared` |
| Open all | every row | LuSquareArrowOutUpRight icon button; opens every item in new background tabs; fires `stash_open_all` |
| Keep | Recent rows only | Marks the row Kept |
| Trash | one-click arm, 3s window | Second click deletes |

## Behavior

- The popup no longer embeds the Library; its header archive button opens
  `library.html` in a new tab (`lib/open-library.ts`).
- The viewer `/stashes` page can open this page via the bridge
  (`stash:viewer:open`) and park records via `stash:viewer:handoff` → the
  pending-import banner is the only merge surface.
- `#settings` renders the same sections the retired `options.html` page
  had (`entrypoints/library/components/settings/*`); `options_ui` in the
  manifest points at `library.html#settings` so browser-level
  "Extension options" links keep working.
