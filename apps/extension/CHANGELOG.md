# @stash/extension

## 0.9.0

### Minor Changes

- 1f1b91f: Add a "Try MCP" panel to the extension options page. Connects to the background MCP server, lists tools, lets the user call one and see the response. Dogfoods the previously unused `connectToBackgroundMcp()`.
- 63174e5: Tighten externally_connectable: drop `ids: ["*"]` (any extension), allowlist MCP-B's production id, add localhost for the local relay. Validate port.sender in the background handler.

### Patch Changes

- 7224704: New `@stash/mcp-relay` package bridging stdio agents (Claude Desktop, Cursor) to the extension's local MCP server. Extension manifest now allows localhost matches for the relay to attach.
- 8d314f9: Align MCP port name across code and docs to "mcp" (was "stash-mcp" in docs). Adds regression test.
- c936f09: Fix MCP self-connect blocker: allow runtime ports whose sender id equals the extension's own `browser.runtime.id` (popup/options pages), while still rejecting foreign ids spoofing a `chrome-extension://` URL.
- Updated dependencies [8d72ba5]
- Updated dependencies [7f99ed4]
- Updated dependencies [2443a0b]
- Updated dependencies [a7c69d4]
  - @stash/server-core@0.2.0
  - @stash/shared@0.9.0
  - @stash/codec@0.9.0
  - @stash/theme@0.9.0

## 0.8.1

### Patch Changes

- @stash/codec@0.8.1
- @stash/theme@0.8.1
- @stash/shared@0.8.1
- @stash/server-core@0.1.4

## 0.8.0

### Minor Changes

- 433b330: Payload schema v6: optional top-level tags and note. Decoder accepts v4/v5/v6; v4/v5 stay decode-only legacy. Adds local stash library, My Stashes UI, MCP tool set, opt-in short links, and telemetry.
- 64603e9: UX cleanup for popup and viewer: shorten-on-demand with link type hints, save-stash form (title, tags, note), header back navigation, grouped copy actions, viewer app header nav, stacked primary actions to prevent overflow.

### Patch Changes

- Updated dependencies [433b330]
  - @stash/codec@0.8.0
  - @stash/server-core@0.1.3
  - @stash/shared@0.8.0
  - @stash/theme@0.8.0

## 0.7.1

### Patch Changes

- 340ce40: Narrow host access to the viewer origin (content scripts, externally_connectable, web-accessible fonts) to pass store review, raise Firefox strict_min_version to 140, and complete the AMO sources archive with first-party workspace packages.

  ***

  ## stash-viewer: patch

  Update privacy policy to disclose short-link KV storage and website analytics.
  - @stash/codec@0.7.1
  - @stash/theme@0.7.1
  - @stash/shared@0.7.1
  - @stash/server-core@0.1.2

## 0.7.0

### Minor Changes

- 551bcb0: Experimental in-extension agent server via `@stash/server-core`: the extension background can host the stash server + MCP bridge locally. The shortener worker is now a thin adapter over the same runtime-agnostic server package, with per-IP rate limiting (RL_STASH/RL_MCP, fail-open) ported into server-core.

### Patch Changes

- @stash/codec@0.7.0
- @stash/theme@0.7.0
- @stash/shared@0.7.0
- @stash/server-core@0.1.1

## 0.6.0

### Minor Changes

- cb1a180: Add /s/new page for on-the-fly stash creation and fix codec URL encoding

### Patch Changes

- Fix GitHub Release workflow to use exact file paths instead of globs for extension artifact uploads
- Updated dependencies
- Updated dependencies [cb1a180]
  - @stash/codec@0.6.0
  - @stash/theme@0.6.0
  - @stash/shared@0.6.0
