# @stash/shared

## 0.9.0

### Minor Changes

- 2443a0b: Move canonical payload fixtures into `@stash/shared` (`fixtures/payloads.json`, `fixtures/sample-tabs.json`) with a pure loader exported from the new `./fixtures` subpath (`loadPayloadFixtures`, `PayloadFixture`), and add `#q=` QR fixtures (`qr-single-tab`, `qr-three-tabs`) plus a v6 metadata fixture (`tagged-stash`). Also add a shared content-negotiation contract (`negotiation.ts`: `negotiateFormat`, `FORMAT_ALIASES`, `isValidFormatParam`, `NEGOTIATION_CASES`) that the viewer and server-core will consume.

### Patch Changes

- @stash/codec@0.9.0

## 0.8.1

### Patch Changes

- @stash/codec@0.8.1

## 0.8.0

### Patch Changes

- Updated dependencies [433b330]
  - @stash/codec@0.8.0

## 0.7.1

### Patch Changes

- @stash/codec@0.7.1

## 0.7.0

### Patch Changes

- @stash/codec@0.7.0

## 0.6.0

### Minor Changes

- cb1a180: Add /s/new page for on-the-fly stash creation and fix codec URL encoding

### Patch Changes

- Fix GitHub Release workflow to use exact file paths instead of globs for extension artifact uploads
- Updated dependencies
- Updated dependencies [cb1a180]
  - @stash/codec@0.6.0
