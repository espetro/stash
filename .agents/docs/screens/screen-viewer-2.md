---
screen: viewer-2
name: Create stash
route: /s/new
file: apps/viewer/src/components/NewStashForm.tsx
---

```text
+--------------------------------------------------------------+
| [<]          + New stash   My stashes   (theme) (lang)       |
+--------------------------------------------------------------+
| + Create stash --------------------------------------------+ |
| | [ Stash title                                    ]        | |
| | +------------------------------------------------------+ | |
| | | https://one.example                                  | | |
| | | https://two.example   (mono textarea, 200px min)     | | |
| | +------------------------------------------------------+ | |
| | [ Expiry: 7 days                                   v ]   | |
| |  L2: invalid URL           <- line errors, only if any    | |
| | +------------------------------------------------------+ | |
| | | 3 items                        812 / 2048 chars       | | |
| | | [=====budget meter bar=====]                          | | |
| | | (v) QR code possible / (!) QR code too large           | | |
| | +------------------------------------------------------+ | |
| | + result block (after Save) ---------------------------+ | |
| | | https://stash.illo.fyi/s#p=...   (mono link)          | | |
| | | payload / short hint caption                          | | |
| | | [ Copy ]                     (h-12, full width)       | | |
| | | [ Save to my stashes ]       (h-12, full width)       | | |
| | | [ Shorten link ]             (hidden when isShortUrl) | | |
| | | Shorten failed caption          (only on error)       | | |
| | +------------------------------------------------------+ | |
| +------------------------------------------------------------+ |
|              [ Save ]  [ Clear ]                              |
+--------------------------------------------------------------+
```

## Elements

| Element | State | Description |
|---|---|---|
| AppHeader | always | Back chevron ghost button when `history.length > 1` (else spacer); "New stash" FaPlus link, "My stashes" FaBoxArchive link, ThemeSwitcher, LanguageSelector |
| Stash title input | always | Optional title embedded in the payload |
| URLs textarea | always | Mono, one URL per line; parsing feeds line errors and budget meter |
| Expiry select | always | 24h / 7d / 30d / never options |
| Line errors | when invalid lines | Red list, "L<n>" prefix per offending line |
| Budget meter | when itemCount > 0 | Item count, char usage with over-budget red text, colored progress bar (primary / amber >80% / red), QR feasibility row |
| Result link | after Save | Mono link to the generated share URL |
| Result hint | payload or short | `stash.link.payloadHint` / `stash.link.shortHint` caption |
| Copy | "Copy" -> "Copied!" | h-12 full-width outline button |
| Save to my stashes | idle / saving / saved / error | h-12 full-width; stores in local library |
| Shorten link | hidden when `isShortUrl` | Shortening / error labels; "Shorten failed" caption below on error |
| Save (footer) | generating / error | Primary footer button |
| Clear | always | Outline footer button resetting the form |

## Behavior

- Telemetry: `urls_pasted` on input, `generation_success` (with itemCount)
  or `generation_failure` on encode, `stash_saved` on local save,
  `shortener_used` after a successful shorten.
- Shorten replaces `resultUrl` with the short link; the shorten button then
  hides and the hint switches to the short variant.
