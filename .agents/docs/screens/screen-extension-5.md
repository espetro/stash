---
screen: extension-5
name: Options page
route: extension options page (chrome://extensions or browser settings)
file: apps/extension/entrypoints/options/App.tsx
---

```text
+--------------------------------------------------+
| Stash Settings            [ Settings saved! ]     |
+--------------------------------------------------+
| Link Expiry                                       |
| Expiry duration [ 7 days                    v ]   |
|                                                   |
| Theme                                             |
| Theme  (Light) (Dark) (System)                    |
|                                                   |
| Viewer                                            |
| Viewer URL [ https://viewer.example.com ] [Save]  |
|                                                   |
| Short Link Sharing                                |
| Optionally publish a frozen snapshot to a         |
| shortener for a short link...                     |
| [x] Enable short link sharing                     |
| Shortener URL [ https://shortener.example ] [Save]|
|                                                   |
| Usage Analytics                                   |
| Sends anonymous aggregate counters...             |
| [x] Share anonymous usage analytics               |
|                                                   |
|                  App version: vX.Y.Z              |
+--------------------------------------------------+
```

## Elements

| Element | State | Description |
|---|---|---|
| Settings saved! | 2s after any save | Header status banner (`role=status`) |
| Expiry select | 24h / 7d / 30d / never | Saves immediately on change |
| Theme switcher | Light / Dark / System | Segmented buttons; System shows effective theme in aria-label; saves immediately |
| Viewer URL row | input + Save button | URL input with validation; Save disabled while empty or invalid, error text below |
| Enable short link sharing | checkbox | Master toggle; saved on change |
| Shortener URL row | input + Save button | Same pattern as viewer URL; gate for the popup Shorten link button |
| Share anonymous usage analytics | checkbox | Saves on change |
| Footer | always | "App version: vX.Y.Z" |

## Behavior

- Every successful change shows the shared "Settings saved!" feedback for
  2 seconds.
- `shortenerEnabled` plus a valid `shortenerOrigin` control whether the
  popup Link result offers "Shorten link".
- `telemetryEnabled=false` stops `recordEvent` counters from being sent;
  no URLs, titles, tags, notes, or identifiers are collected either way.
- Loading state shows "Loading settings..." until settings resolve.
