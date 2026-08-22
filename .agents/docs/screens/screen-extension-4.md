---
screen: extension-4
name: History
route: extension popup, history view
file: apps/extension/entrypoints/popup/components/HistoryView.tsx
---

```text
+--------------------------------------------------+
| [<] Stash                (archive) (clock) (cog) |
+--------------------------------------------------+
| History                                  [CLEAR] |
| [ Search by URL... ]                             |
| +----------------------------------------------+ |
| | (clock) Aug 22, 2026 10:04     3 days left > | |
| |         3 tabs                               | |
| +----------------------------------------------+ |
| | (clock) Aug 20, 2026 09:12       expired     | |
| +----------------------------------------------+ |
| SHOWING LAST 30 DAYS               12 active    |
+--------------------------------------------------+
```

## Elements

| Element | State | Description |
|---|---|---|
| CLEAR | only when entries exist | Wipes history |
| Search | only when entries exist | Filters by URL substring |
| History entry | active / expired | LuAlarmClock icon, date, "N tabs", remaining time (warning color under 24h), chevron on active only |
| Entry expiry | active / expiring soon / expired | `formatRemainingTime`; expired rows are not clickable |
| Empty state | none / no match | LuClipboardList icon + "No history yet" / "No matching entries" |
| Footer | only when entries exist | "SHOWING LAST 30 DAYS" + count of non-expired entries |

## Behavior

- Entries sorted by `createdAt` descending (sort applies when searching).
- Clicking an active entry swaps the view to LinkResult for that entry
  (tabs list empty, so Copy as... is disabled); back chevron returns to
  History, back from History returns to main.
