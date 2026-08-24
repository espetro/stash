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
| | [(source chip) This browser's extension library]          | |
| | [Read-only mirror of the extension library; ...]          | |
| | [(search) Search by title, tag or note            ]        | |
| | +------------------------------------------------------+   | |
| | | Stash title                          (no edit/trash) |   | |
| | | [tag] [tag]                                          |   | |
| | | 3 items · Aug 22, 2026 10:04                         |   | |
| | +------------------------------------------------------+   | |
| | | (expanded) note text                 <- optional     |   | |
| | |   favicon Title  domain              (per item)      |   | |
| | +------------------------------------------------------+   | |
| | (empty: "No stashes yet" dashed box)                      | |
| | import result caption (3s, viewer-local only)             | |
| +------------------------------------------------------------+ |
|              [ + New stash ]   (primary, viewer-local only)   |
|                    (export)  (import)   (viewer-local only)   |
+--------------------------------------------------------------+
| <script id="stash-local-export" data-stash-status="ready">   |
|   { "version":1, "source":"extension", "stashes":[...] }      |
| </script>                                                     |
+--------------------------------------------------------------+
```

## Elements

| Element | State | Description |
|---|---|---|
| AppHeader | always | Back chevron, New stash / My stashes links, theme and language |
| Source chip | always | "This browser's extension library" or "Saved in this browser."; `[data-stash-source]` |
| Read-only hint | extension source only | "Read-only mirror of the extension library; ..." |
| Search | always | FaMagnifyingGlass icon inside the input; filters the library |
| Stash card | collapsed / expanded | Title (or "Untitled"), tag chips, "N items · date"; expanding fires `stash_reopened` |
| Edit (pen) | viewer-local only | Opens StashEditForm |
| Delete (trash) | viewer-local only | Opens confirm dialog |
| Item rows | expanded | `TabListItem` per item, note items included |
| Empty state | no records | Dashed-border centered paragraph |
| Import caption | 3s after import | Success ("N imported") or error message |
| New stash | viewer-local only | FaPlus label; navigates to `/s/new` |
| Export | viewer-local only | FaFileArrowDown, downloads library JSON |
| Import | viewer-local only | FaFileArrowUp, triggers hidden file input (JSON) |
| `#stash-local-export` | always | JSON island with canonical `StashExport`; `data-stash-status` lifecycle |

## Behavior

- On mount, the page probes the extension bridge via
  `apps/viewer/src/lib/local-bridge.ts`. If the bridge replies with a
  `source: "extension"` `StashExport`, the page renders those records
  in memory and does NOT touch viewer `localStorage`/`IndexedDB`.
  Otherwise the page falls back to viewer-local `localStorage`.
- The page never merges sources. The active source is shown as a chip
  above the list.
- When the extension source is active, edit / delete / export / import
  actions are hidden — the mirror is read-only.
- Outbound item anchors use `rel="noopener noreferrer nofollow"` and
  `target="_blank"`. Non-`http(s)` URLs are filtered out before render.
- A `<script type="application/json" id="stash-local-export">` element
  is rendered at the page root with `data-stash-status="loading"` until
  the source settles, then `"ready"`. The island is the canonical export
  surface for browser-class agents (ChromeClaw, NanoBrowser, BrowserOS).
- Stable semantic selectors: `[data-stash-root]`, `[data-stash-list]`,
  `[data-stash-record-id]`, `[data-stash-title]`, `[data-stash-item-url]`.
- `?agent=json` renders `<pre id="agent-export">` (canonical JSON).
- `?agent=markdown` renders `<pre id="agent-export-md">` (markdown per
  `/s` conventions: `# title`, `- [label](url)` per item, `tags: ...`,
  `note: ...`).
- Both `?agent=` views are browser-only — `page.request.get` returns an
  empty Astro shell because the page is `client:only="react"`. Fetch-only
  agents must use `/s?p=<payload>` instead.
- Fires `stash_list_viewed` on mount and `stash_reopened` when a card is
  first expanded.
- Delete is a two-step flow inside a Dialog (no arm timer, unlike the
  extension popup). The hidden `<input type="file">` sits at the page
  root; import feedback shows as a caption for 3 seconds.
