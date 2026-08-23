# UI Screens registry

Canonical ASCII map of every user-facing screen. One file per screen, in
brioso style: frontmatter, a fenced ASCII diagram, an elements table, and
behavior notes. Keep these in sync with the source. No staleness checker
exists; stale ASCII is worse than none, so update the affected file
whenever you touch UI layout, copy, or flows.

## User flows

```
Extension popup (main)
  -> select tabs -> "Share tabs (N)"  -> Link result
  -> select tabs -> "Save locally"    -> Save stash form -> main
  -> header stashes                   -> My Stashes
  -> header history                   -> History -> (active entry) Link result
  -> header settings                  -> browser options page

Viewer
  /            landing
  /s/new       create form -> result block (copy / save locally / shorten)
  /s/<payload> tab viewer -> QR dialog | Share drawer (JSON / Markdown)
  /stashes     My Stashes (expand / edit / delete / import / export)
  /privacy /terms  static legal pages
  /docs/...    Starlight docs shell
```

## Screens

| Name | Route / surface | File |
|---|---|---|
| Popup selection view | extension popup, main view | `screen-extension-1.md` |
| Link result | extension popup, after share or from History | `screen-extension-2.md` |
| My Stashes (popup) | extension popup, stashes view | `screen-extension-3.md` |
| History | extension popup, history view | `screen-extension-4.md` |
| Options page | extension options page (Shortener/Telemetry forms) | `screen-extension-5.md` |
| Landing | viewer `/` | `screen-viewer-1.md` |
| Create stash | viewer `/s/new` | `screen-viewer-2.md` |
| Tab viewer | viewer `/s/<id>` plus `/s?p=` content-negotiated payload route | `screen-viewer-3.md` |
| My Stashes (viewer) | viewer `/stashes` | `screen-viewer-4.md` |
| ShareDrawer dialog | viewer, bottom drawer from tab viewer | `screen-viewer-5.md` |
| QR dialog | viewer, dialog from tab viewer | `screen-viewer-6.md` |
| Privacy / Terms | viewer `/privacy`, `/terms` | `screen-viewer-7.md` |
| Docs shell | viewer `/docs` Starlight layout | `screen-docs-1.md` |

## Retired screens / elements

Do not reintroduce these; they were removed on purpose.

- Bottom back-button rows in popup subviews (history, stashes): replaced by
  the header top-left back chevron (`Header.tsx` `onBack`).
- Footer theme + language cluster in the viewer tab viewer card footer:
  replaced by the compact ThemeSwitcher + LanguageSelector row inside
  `SharedCardContent` (tab viewer) and the AppHeader on `/s/new`, `/stashes`.
- `myStashes.navLink` anchor style in the viewer (sidebar nav link to
  `/stashes`): removed; navigation to `/stashes` goes through the AppHeader
  "My stashes" button.

## Known gaps

- No dedicated screen file for the localized variants (`/es`, `/fr`, `/ru`
  landing mirrors). They render the same layout as `screen-viewer-1.md`
  with translated copy.
- NoteDialog inside the tab viewer (opens a stash note item) is documented
  under `screen-viewer-3.md` behavior, not as its own file.
- StashEditForm and delete-confirm dialog inside viewer My Stashes are
  documented under `screen-viewer-4.md` behavior.
