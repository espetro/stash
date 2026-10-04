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
| | From the extension                                         | |
| | +------------------------------------------------------+   | |
| | | Recent stash [Recent]                (read-only)     |   | |
| | | [tag] 3 items · Aug 22, 2026 10:04                   |   | |
| | +------------------------------------------------------+   | |
| | Saved in this browser                                     | |
| | +------------------------------------------------------+   | |
| | | Local stash [Kept]                   (edit) (delete) |   | |
| | +------------------------------------------------------+   | |
| | (section-specific empty message when empty)               | |
| | import result caption (3s, viewer-local only)             | |
| +------------------------------------------------------------+ |
|              [ + New stash ]   (primary, viewer-local only)   |
|                    (export)  (import)   (viewer-local only)   |
+--------------------------------------------------------------+
| <script id="stash-local-export" data-stash-status="ready">   |
|   { "version":1, "source":"extension", "stashes":[...] }      |
| </script>                                                     |
| <a class="sr-only" data-agent-hint href="/stashes/?agent=json"|
|   >Agents: read every stash in one request at ...</a>         |
+--------------------------------------------------------------+
```

## Elements

| Element | State | Description |
|---|---|---|
| AppHeader | always | Back chevron, New stash / My stashes links, theme and language |
| Mobile header | below 640px | AppHeader navigation links are icon-only. |
| Source chip | always | "This browser's extension library" or "Saved in this browser."; `[data-stash-source]` |
| Read-only hint | extension source only | "Read-only mirror of the extension library; ..." |
| Search | always | FaMagnifyingGlass icon inside the input; filters the library |
| Extension section | bridge source only | "From the extension"; records are read-only and show localized Kept / Recent badges |
| Viewer-local section | bridge source only | "Saved in this browser"; viewer-local records remain editable |
| Stash card | collapsed / expanded | Title (or "Untitled"), tag chips, "N items · date"; expanding fires `stash_reopened` |
| Edit (pen) | viewer-local records only | Opens StashEditForm |
| Delete (trash) | viewer-local records only | Opens confirm dialog |
| Item rows | expanded | `TabListItem` per item, note items included |
| Empty state | no records | Dashed-border centered paragraph |
| Import caption | 3s after import | Success ("N imported") or error message |
| New stash | viewer-local only | FaPlus label; navigates to `/s/new` |
| Export | viewer-local only | FaFileArrowDown, downloads library JSON |
| Import | viewer-local only | FaFileArrowUp, triggers hidden file input (JSON) |
| `#stash-local-export` | always | JSON island with canonical `StashExport`; `data-stash-status` lifecycle |
| Agent hint anchor | always, normal view only | `sr-only` `<a data-agent-hint href="/stashes/?agent=json">`; a11y-tree-visible pointer for DOM-snapshot browser agents |

## Behavior

- On mount, the page probes the extension bridge via
  `apps/viewer/src/lib/local-bridge.ts`. If the bridge replies with a
  `source: "extension"` `StashExport`, the page renders those records
  in memory and does NOT touch viewer `localStorage`/`IndexedDB`.
  Otherwise the page falls back to viewer-local `localStorage`.
- With an extension bridge response, the page shows extension records
  in a read-only section and viewer-local records in a separate editable
  section. Without the bridge, the existing viewer-local-only layout is
  preserved.
- The active bridge source is shown as a chip above the sections. The
  agent JSON export contract remains extension-sourced when the bridge
  is available; viewer-local records are not merged into that export.
- Extension records cannot be edited or deleted from the viewer.
- Outbound item anchors use `rel="noopener noreferrer nofollow"` and
  `target="_blank"`. Non-`http(s)` URLs are filtered out before render.
- A `<script type="application/json" id="stash-local-export">` element
  is rendered at the page root with `data-stash-status="loading"` until
  the source settles, then `"ready"`. `<script>` elements are invisible
  to default DOM-snapshot/text-extraction tools in common browser-agent
  runtimes (BrowserOS-class) — only `evaluate_script`/`get_dom`/raw
  `page.content()` readers can reach it.
- A `sr-only` `<a data-agent-hint href="/stashes/?agent=json">` sits next
  to the island, next to the file input, in the normal view only (not in
  `?agent=` views). It is a real accessibility surface (announced by
  screen readers) that also lands in the a11y tree, extracted page text,
  and page-links enumeration — the three perception paths DOM-snapshot
  agents actually use — pointing them at `/stashes/?agent=json`.
- Stable semantic selectors: `[data-stash-root]`, `[data-stash-list]`,
  `[data-stash-record-id]`, `[data-stash-title]`.
- `?agent=json` renders `<pre id="agent-export">` — the canonical
  `StashExport` shape, serialized from the same `records` list the
  normal view renders (not just the extension-sourced island).
- `?agent=markdown` renders `<pre id="agent-export-md">` (markdown per
  `/s` conventions: `# title`, `- [label](url)` per item, `tags: ...`,
  `note: ...`) — same record set as `?agent=json`.
- Both `?agent=` views are browser-only — `page.request.get` returns an
  empty Astro shell because the page is `client:only="react"`. Fetch-only
  agents must use `/s?p=<payload>` instead.
- Fires `stash_list_viewed` on mount and `stash_reopened` when a card is
  first expanded.
- Delete is a two-step flow inside a Dialog (no arm timer, unlike the
  extension popup). The hidden `<input type="file">` sits at the page
  root; import feedback shows as a caption for 3 seconds.
