# stash-viewer

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
