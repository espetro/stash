# stash-viewer

## 0.8.1

### Patch Changes

- Floating pill navbar with shadcn-style NavigationMenu and a Settings
  dropdown (theme + language). Footer is now links-only — theme and
  language controls moved to the navbar.
  - @stash/codec@0.8.1
  - @stash/theme@0.8.1
  - @stash/shared@0.8.1

## 0.8.0

### Minor Changes

- 433b330: Payload schema v6: optional top-level tags and note. Decoder accepts v4/v5/v6; v4/v5 stay decode-only legacy. Adds local stash library, My Stashes UI, MCP tool set, opt-in short links, and telemetry.
- 64603e9: UX cleanup for popup and viewer: shorten-on-demand with link type hints, save-stash form (title, tags, note), header back navigation, grouped copy actions, viewer app header nav, stacked primary actions to prevent overflow.

### Patch Changes

- Updated dependencies [433b330]
  - @stash/codec@0.8.0
  - @stash/shared@0.8.0
  - @stash/theme@0.8.0

## 0.7.1

### Patch Changes

- @stash/codec@0.7.1
- @stash/theme@0.7.1
- @stash/shared@0.7.1

## 0.7.0

### Minor Changes

- d151ee9: Locale-prefixed landing URLs (`/es`, `/fr`, `/ru`) with full i18n coverage of every landing section. Adds `<html lang>`, hreflang alternates, canonical tags, and `@astrojs/sitemap` integration. The `intl-ai` config now loads `.env` automatically via Node's built-in `loadEnvFile`, so `pnpm run i18n:fill` works without sourcing env vars manually.

### Patch Changes

- @stash/codec@0.7.0
- @stash/theme@0.7.0
- @stash/shared@0.7.0

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
