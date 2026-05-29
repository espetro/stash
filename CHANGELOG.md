# Changelog

All notable changes to this project will be documented in this file.

## 0.6.0

### Added
- Extension QR generation, export, and theme switcher
- Server-fetchable API for stash content (`/json` and `/md` routes with HTTP caching)
- PostHog analytics integration in viewer layout
- Shared utilities package (`@stash/shared`) with extracted components and hooks
- Vitest test infrastructure for extension with useTabSelection hook tests
- Project roadmap documentation
- Browser extension install URL constants in viewer
- Vendor bundle splitting with manual chunks for Cloudflare Pages

### Changed
- Replace inline SVG with react-icons across extension and viewer
- Extract QR encoding to web worker in viewer
- Extract popup Header, improve history view, and replace emoji icons in extension
- Configure path aliases and extract options form components in extension
- Add ExpiryOption interface and widen shared types
- Improve TabViewer layout and QR dialog sizing
- Replace canvas with sync QR component for blank QR code fix
- Improve regex escaping in codec and update dependencies
- Update turbo and typescript configuration
- Update app icons for extension and viewer

### Fixed
- Decouple tab selection from `browser.tabs.highlight` in extension
- Handle undefined `import.meta.env` in Wrangler/esbuild builds
- Fix Cloudflare Pages CSS serving with `_headers` MIME types
- Fix CI Node.js version (upgrade to v22) and deployment configuration
- Fix PostHog env var optionality and wiring across packages
- Remove invalid Content-Type header causing CF Pages 500s on CSS

## 0.5.0

### Fixed
- Fix parallel script execution in build and zip tasks to properly propagate errors
- Fix changeset baseBranch configuration to use master as default branch

## 0.4.0

### Added
- New viewer UI built with React and shadcn
- Comprehensive roundtrip tests for TLD index encoding

### Changed
- Unify on v4 msgpack with dual transport adapters
- Deterministic TLD restoration in decoder
- TLD index encoding in normalizer
- Lower compression threshold from 500 to 200 bytes

### Fixed
- Remove stale js files and add clean targets to monorepo

## 0.3.0

### Added
- Add `/s/new` page for on-the-fly stash creation
- Add vitest for codec package tests

### Fixed
- Fix codec URL encoding (remove TLD stripping)
