---
screen: extension-2
name: Link result
route: extension popup, after sharing tabs
file: apps/extension/entrypoints/popup/components/LinkResult.tsx
---

```text
+--------------------------------------------------+
| [<] Stash                         (library) (cog) |
+--------------------------------------------------+
| N items · expires in 7 days                      |
|   or: N of M tabs (URL budget limit)             |
| +----------------------------------------------+ |
| | https://viewer.example.com/s#p=... (mono)    | |
| +----------------------------------------------+ |
| Self-contained link. Tab data lives in the       |
| URL. Expires in 7 days.                          |
|            +------------+                       |
|            |   QR code  |                        |
|            +------------+                       |
| [ Keep in Library ]                              |
| Added to Library as Recent. It's removed when the |
| link expires unless you keep it.                 |
| [ Copy link ]  [ Shorten link ]                  |
|        or: [ Copy link ] Shortened               |
| [ Copy as... v ]                                 |
|   +----------------+   <- popover when open      |
|   | JSON / Markdown|                            |
|   +----------------+                             |
+--------------------------------------------------+
```

## Elements

| Element | State | Description |
|---|---|---|
| Meta line | default | "N item(s) · expires in X" (expiry omitted for `never`) |
| Meta line | truncated | "N of M tabs (URL budget limit)" |
| URL box | readOnly mono input | Click selects all; shows `displayUrl` (payload or shortened) |
| Hint | dynamic | payload: "Self-contained link. Tab data lives in the URL. Expires in X."; short: "Short link. A copy is stored on the shortener for up to 7 days."; failed: "Couldn't shorten, using self-contained link." |
| QR | render or error | lean-qr of `displayUrl`; "URL too large for QR code" fallback |
| Copy link | primary, flips to secondary "Copied!" for 2s | Copies `copyUrl` (updated after shortening) |
| Shorten link | secondary | Only when `shortenerEnabled` and URL contains `#p=`; "Shortening..." while busy; disabled after failure |
| Shortened caption | after success | Replaces the shorten button |
| Keep in Library | primary, flips to disabled "Kept ✓" | Keeps this Recent record in the Library; shown with the exact expiry hint below |
| Copy as... v | secondary + `LuChevronDown` | Disabled when `tabs.length === 0` with tooltip "Tab data unavailable for this link" |
| Copy as menu | popover | JSON / Markdown items, each flips to "Copied!" for 2s |

## Behavior

- Shown after a share is created (App state `shareUrl`).
- New shares are added to the Library as Recent before the result is shown.
- The Keep action marks the associated Library record as Kept without
  changing the share URL or its expiry.
- Shorten calls `shortenShareUrl(displayUrl, shortenerOrigin)`; on success
  replaces displayed URL, sets state `short`, fires `shortener_used`, and
  updates the URL used by Copy link via `onShortened`.
- Copy as JSON / Markdown uses `exportToJSON` / `exportToMarkdown` over the
  originally shared tabs.
- Back chevron clears link state and returns to the main view.
