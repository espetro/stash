---
screen: extension-1
name: Popup selection view
route: extension popup, main view
file: apps/extension/entrypoints/popup/App.tsx
---

```text
+--------------------------------------------------+
| [<] Stash                (archive) (clock) (cog) |
+--------------------------------------------------+
| [Select All]  N of M selected                    |
| (URL budget limit reached)          <- only if   |
|                                       truncated  |
| [x] favicon Tab title (30 char cut)  domain      |
| [x] favicon Tab title ...            domain      |
| [ ] favicon Tab title ...            domain      |
| ...                                              |
+--------------------------------------------------+
| [ Share tabs (N) ]  [ Save locally ]             |
+--------------------------------------------------+
```

Elements from `App.tsx`, `Header.tsx`, `SelectAllToggle.tsx`, `TabItem.tsx`.

## Elements

| Element | State | Description |
|---|---|---|
| Back chevron | hidden on main view | `LuArrowLeft` top-left; appears only in subviews or link result |
| Stash title | always | Header `<h1>Stash</h1>` next to back chevron |
| Header buttons | always | LuArchive (My Stashes), LuClock (History), LuCog (Options) |
| Select All / Deselect All | toggles by `allSelected` | Secondary button; Select All respects URL budget (`findMaxTabsWithinBudget`) |
| Selected count | always | "N of M selected" text right of the toggle |
| Budget message | only when `maxTabCount < tabs.length` | "URL budget limit reached" |
| Tab row | checked / unchecked | Checkbox + favicon + title (truncated at 30 chars, full title in `title` attr) + domain |
| Share tabs (N) | primary, disabled at N=0 | Creates link, copies to clipboard, adds to history, shows Link result |
| Save locally | secondary, disabled at N=0 | Title tooltip "Keep this session in your stash library on this device." |
| Error banner | when `error` set | `ErrorMessage`, dismissible |

### SaveStashForm subview (view = saveStash)

Same header with back chevron; body swaps to the save form
(`SaveStashForm.tsx`):

```text
+--------------------------------------------------+
| [<] Stash                (archive) (clock) (cog) |
+--------------------------------------------------+
| Save N tabs                                      |
| [ Stash title                            ]       |
| [ tags, comma, separated                 ]       |
| [ Note                                   ]       |
| [ Save ]  [ Cancel ]                             |
+--------------------------------------------------+
```

Save button reads "Saving..." while persisting; on success the view shows
only "Saved!" and returns to main after 1.5s. Cancel discards and returns.
Fires `stash_saved` on success.

## Behavior

- On open fires telemetry `popup_open`; first tab toggle fires `tabs_selected`.
- Share tabs: encodes with brotli per `settings.expiryMode`, copies URL,
  writes history entry, transitions to LinkResult with item count,
  truncated flag and selected tabs. Fires `create_clicked` then `link_copied`.
- Save locally with zero selection sets error "Please select at least one
  tab"; otherwise opens the SaveStashForm view.
- Header archive button fires `stash_list_viewed` then swaps to stashes view.
