---
screen: extension-5
name: Settings tab
route: extension Library page, `#settings` (was: standalone options.html)
file: apps/extension/entrypoints/library/components/SettingsView.tsx
---

```text
+--------------------------------------------------+
| Stash Library          [ Library ] [ Settings ]   |
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
| Local Library Bridge                              |
| Allow the configured viewer origin to read this  |
| profile's stash library when /stashes is opened.  |
| **This setting roams with your browser account**  |
| (stored in browser.storage.sync). Enabling it    |
| exposes stash titles, URLs, tags, and notes to    |
| JavaScript loaded by the viewer origin.           |
| [ ] Expose local stash library to /stashes        |
|                                                   |
| Usage Analytics                                   |
| Sends anonymous aggregate counters...             |
| [x] Share anonymous usage analytics               |
|                                                   |
| Try MCP                                           |
| Connect to the local MCP server running in the    |
| background, list its tools, and call one with     |
| arbitrary JSON arguments...                       |
| [Connect] [Disconnect]   Status: 8 tools loaded   |
| Tool [ stash_list                              v] |
|   Description text shown under the select         |
| Arguments (JSON)                                  |
| +-----------------------------------------------+ |
| | {}                                            | |
| +-----------------------------------------------+ |
```

## Elements

| Element | State | Description |
|---|---|---|
| Settings saved! | transient 2s | Success indicator after each save |
| Link Expiry | `24h` / `7d` / `30d` / `never` | Select; applies to newly created share links |
| Theme | `light` / `dark` / `system` | `OptionsThemeForm` + `ThemeSwitcher`; instant via `initTheme` |
| Viewer URL | text input + Save | `OptionsViewerForm`; the origin share links point at |
| Short link sharing | checkbox + URL + Save | `OptionsShortenerForm`; enables the Shorten button in link results |
| Local Library Bridge | checkbox | `OptionsLocalLibraryForm`; gates `stash:viewer:request` (presence/open/handoff stay available) |
| Usage Analytics | checkbox | `OptionsTelemetryForm` |
| Try MCP | connect/list/call panel | `TryMcpPanel`; exercises the in-extension MCP server |

## Behavior

- Sections are identical to the retired `options.html` page; the only
  difference is the host surface: they render inside the Library page's
  `#settings` tab under `entrypoints/library/`.
- `options_ui` in `wxt.config.ts` points at `library.html#settings` with
  `open_in_tab: true`, so browser-level "Extension options" and the
  popup's settings button land here.
