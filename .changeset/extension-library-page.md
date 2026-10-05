---
"@stash/extension": minor
"stash-viewer": patch
---

Move the Library out of the popup into a dedicated `library.html` page.
The popup is now collection-only (Share / Save locally) with an "Open
Library" button; the new page hosts the full library — All/Kept/Recent,
search, inline editing, per-row Share + QR + Open-all, import/export —
plus a `#settings` tab carrying the old options page (`options_ui` now
points there). `/stashes` detects the extension via an always-on
presence ping and offers "Open your Library in the extension" plus a
one-time handoff that parks viewer-local records for a user-confirmed
import; while never paired, the page shows a "Not backed up: install
daemon or export" hint. The data bridge keeps its `localLibraryViewerEnabled`
gate — presence, open, and handoff work regardless.
