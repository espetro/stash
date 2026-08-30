---
screen: viewer-3
name: Tab viewer
route: /s/<payload> (also /s?p=... payload route)
file: apps/viewer/src/components/TabViewer.tsx
---

```text
+--------------------------------------------------------------+
| + Shared Tabs (or stash title) ------------------------------+ |
| | caption: N items · expires in X                            | |
| |                                                            | |
| | (v) Select all            N  Open selected  Remove selected| |
| | +------------------------------------------------------+   | |
| | | [x] favicon Title              domain      (note)     |   | |
| | | [x] favicon Title              domain                 |   | |
| | |     ... scrollable list                              |   | |
| | +------------------------------------------------------+   | |
| |              (theme) (lang)                                | |
| +------------------------------------------------------------+ |
|    [ Share QR v ]        [ New stash ]                        |
|    + edited link block (after saving edits) +                 |
+--------------------------------------------------------------+
```

Payload route (content negotiated, no UI): `GET /s?p=` returns
structured JSON, Markdown, or a plain URL list depending on the
`Accept` header (`application/json`, `text/markdown`, `text/plain`,
default HTML), with a `?format=json|md|txt` query fallback; an unknown
format value returns `400` JSON. See the agent notice comment in
`apps/viewer/src/pages/s.astro`.

## Elements

| Element | State | Description |
|---|---|---|
| Card header | always | Stash title (or "Shared tabs") plus `buildCaption` item count and expiry |
| Select all | toggles | FaRegSquare / FaRegSquareCheck; `aria-pressed` |
| Selection bar | only when selected.size > 0 | Count, "Open selected" (new tabs, noopener), "Remove selected" |
| Tab list row | selected / unselected | Favicon, title, domain; note items open a NoteDialog; shift+click selects a range |
| Empty list | after removing all | Empty-state paragraph |
| Theme / lang row | always | Centered ThemeSwitcher + LanguageSelector inside the card content |
| Share QR v | default footer | SplitButtonGroup: main opens the QR dialog, dropdown opens the ShareDrawer |
| Save edited / New stash | footer | When items were removed (dirty), the split button is replaced by an OutlineButton "Save edited"; always followed by "New stash" linking `/s/new` |
| Edited link block | after save | Caption "Edited link" plus mono link to the re-encoded URL (remaining lifetime preserved) |
| NoteDialog | on note item click | Modal with note text and Close button |

## Behavior

- Decodes the URL fragment client-side (`useDecodeShareUrl`); loading and
  error states render a full-page message.
- Removing items marks the list dirty; "Save edited" re-encodes the
  remaining items and shows the new link. Save states: generating, saved,
  error (auto-reset after 2s).
- Selection supports click toggle and shift+click range anchored on the
  last clicked row; "Select all" resets the anchor.
- JSON and Markdown formats bypass the card entirely and render raw `<pre>`
  output.

## Loopback serving (F12)

The daemon (`stash-daemon serve`) embeds this same shell and serves it at
`http://127.0.0.1:<random port>/`, including the `?p=` content-negotiated
route (same contract: explicit `?format=` wins, Accept negotiation,
`X-Robots-Tag: noindex` everywhere, decode errors as a readable error page
or 400 JSON). `viewerDisabled: true` in stash.toml turns it off;
`stash-daemon status` prints the current viewer URL. The fragment `#p=`
never reaches the daemon; decoding of fragment links happens client-side
with zero egress.
