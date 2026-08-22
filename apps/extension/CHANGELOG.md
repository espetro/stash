# @stash/extension

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
