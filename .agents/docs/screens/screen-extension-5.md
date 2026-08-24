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
| [Call]                                            |
| Response                                          |
| +-----------------------------------------------+ |
| | { "stashes": [ ... ] }                        | |
| +-----------------------------------------------+ |
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
| Local Library Bridge | checkbox | Saved on change; lives in `browser.storage.sync` so it roams with the browser account |
| Share anonymous usage analytics | checkbox | Saves on change |
| Try MCP - Connect button | always shown | Opens a `browser.runtime.connect({name: "stash-mcp"})` port, wraps it in `ChromePortTransport`, calls `client.connect()` + `client.listTools()`. Disabled while connecting. |
| Try MCP - Disconnect button | only when connected | Closes the SDK client and clears tool list / response. |
| Try MCP - status line | live (`aria-live=polite`) | "Not connected" / "Connecting…" / "N tools loaded" / "Error". |
| Try MCP - Tool select | enabled after connect | Lists tools returned by `listTools()`. Selecting a tool clears any previous response and error. |
| Try MCP - Tool description | shown below select | Description from the `listTools()` payload for the currently selected tool. |
| Try MCP - Arguments textarea | always editable | JSON; empty string or `{}` sends an empty object. Invalid JSON blocks Call and shows an inline error. |
| Try MCP - Call button | disabled until connected + tool picked | Invokes `client.callTool({name, arguments})`. Renders `content[0].text` (or full JSON if no text part) in the Response block. |
| Try MCP - Response block | shown after Call | Monospace `<pre>` with the first text content from the tool result. |
| Try MCP - Error block | when anything fails | `role=alert` with the thrown error message or "Invalid JSON: ...". |
| Footer | always | "App version: vX.Y.Z" |

## Behavior

- Every successful change shows the shared "Settings saved!" feedback for
  2 seconds.
- `shortenerEnabled` plus a valid `shortenerOrigin` control whether the
  popup Link result offers "Shorten link".
- `telemetryEnabled=false` stops `recordEvent` counters from being sent;
  no URLs, titles, tags, notes, or identifiers are collected either way.
- The Try MCP panel dogfoods `connectToBackgroundMcp()` (lib/mcp/client.ts),
  which was previously unused. The same `ChromePortTransport` class is
  reused on both ends: the server side wraps the port handed to
  `startMcpServerOverTransport`, the panel wraps the port returned by
  `connectToBackgroundMcp()`. The SDK distinguishes the two only by who
  calls `start()` / `client.connect()`.
- The SDK `Client` is closed on panel unmount and on Disconnect so the
  background port is released.
- Loading state shows "Loading settings..." until settings resolve.
