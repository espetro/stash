# Changelog

All notable changes to this project will be documented in this file.

## 0.10.5

### Added
- Viewer OG-image card for richer link previews
- Automated Chrome Web Store / Firefox AMO submission in the release workflow
- Expanded privacy policy and meta description for OAuth brand verification
- Extension surfaces the install setup row and copyable daemon install command on the sync banner

### Fixed
- Daemon installer defaults to the store extension id and guides dev builds
- E2E alternate-link fetches repointed to the local stand-in regardless of build origin
- CI/daemon stub embedded viewer dist so Go vet/test compile without a viewer build

## 0.10.4

> Covers everything merged since v0.9.0, including the changesets versioned as
> 0.10.1–0.10.3 which were never tagged or released.

### Added
- **Stash daemon (Go)**: local-first re-platform — stdio MCP server, native-messaging host, reverse-channel hub for `stash_snapshot_tabs`, curl|sh installer, goreleaser release pipeline (`daemon-v*` tags), and an embedded loopback viewer for offline `/s` decode
- Daemon↔extension sync: pairing, persistent outbox, LWW materialization, automerge CRDT document model, and F5 sync client wired into the background worker
- Zero-trust relay: client-side AES-256-GCM payload encryption with the key in the share URL fragment; relay stores ciphertext only and viewer decrypts client-side
- Relay rework: TTL from config, `DELETE /api/stash/:id` revocation, fail-closed rate limiting, OpenAPI docs
- Viewer agent-readiness surfaces: well-known docs, content signals, Link headers, `?format=` negotiation, `/s?p=` consolidated decode endpoint, llms.txt refresh
- `/stashes` local library: source-aware loading via postMessage bridge probe, agent JSON view, XSS battery tests
- Extension local stash library UI: "My Stashes", save-stash form with title/tags/note, kept/recent share lifecycle, history merged into Saved view, `shares[]` on StashRecord with export v2 (v1 import shim)
- FailoverMonitor mirror-origin selection and portable mirror app for self-hosters
- Agent eval harness: OpenRouter LLM evals, model-panel sweep, token metrics, agent-first tool benchmark
- Contract precision: `{error, code, hint}` error responses and richer MCP tool descriptions

### Changed
- Payload v6 with optional `tags` and `note` fields; codec conformance fixture set shared across TS and Go
- `@stash/shared` agent-export subpath with the `StashExport` contract
- Server card advertises local surfaces; mcp-relay package removed (daemon supersedes it)
- Shortener reframed and documented as the self-hostable stash relay

### Fixed
- Extension daemon-offline status surface and native-messaging pairing repaired end to end
- Viewer preserves redirects and share metadata; icon-only app header nav on mobile
- Untouched stash fields preserved on partial updates (extension and viewer)

## 0.9.0

### Added
- Agent URL extraction across viewer pages, canonical payload fixtures, and format-negotiation contract in `@stash/shared`
- `?format=` negotiation on `/s/:id` with 301 legacy suffix redirects and `text/plain` rendering (`renderPlainUrlList`)
- Dual-surface MCP discovery card in server-core
- `mcp-relay` package bridging stdio agents to the extension MCP port; "Try MCP" panel in extension options
- Opt-in OpenRouter LLM eval harness and agent-flow e2e specs with an extension MCP seed harness
- Extension `Local Library Bridge` options section and `localLibraryViewerEnabled` opt-in content-script bridge

### Fixed
- Extension-internal connects allowed to the MCP port; MCP port name aligned to `mcp`
- `externally_connectable` allowlist tightened (E11)

## 0.8.1

### Added
- Floating pill navbar with Settings dropdown on viewer pages; system option in ThemeSwitcher

### Fixed
- Footer no longer inlines theme/language controls (moved to navbar)
- Vendored brotli JS committed (was excluded by gitignore, breaking Pages payload routes)
- E2E expectations updated for payload version 6

## 0.8.0

### Added
- Payload v6 with optional `tags` and `note` fields
- Extension local stash library and "My Stashes" UI; save-stash form with title, tags, and note; shorten-on-demand with link type hints
- Viewer "My Stashes" page surfacing v6 fields
- Shortener opt-in short-link sharing with fail-closed rate limiting
- ASCII screen registry for all user-facing screens

### Removed
- Experimental bridge server (content-script relay / fetch bridge)

### Fixed
- AMO sources zip re-rooted without `..` paths; viewer brotli wasm vendored for Pages Functions
- Viewer primary actions stack to prevent header overflow; extension back navigation moved to header with grouped copy actions

## 0.7.1

### Fixed
- AMO sources zip completed with workspace packages; extension tscheck prepares WXT types first
- CI installs Playwright browsers with the workspace-pinned version; viewer astro content types synced in tscheck
- Extension host access narrowed to the viewer origin for store review; Firefox minimum raised to 140
- intl-ai upgraded to 0.4.x; privacy policy updated for short-link storage and analytics

## 0.7.0

### Added
- `@stash/server-core`: runtime-agnostic stash server extracted from the Cloudflare worker; shortener is now a thin adapter
- Short-link Cloudflare Worker with KV storage, stateless MCP server at `/mcp`, discovery card, and per-IP rate limiting
- Extension hosts the stash server in the background service worker with an MCP server over a Chrome runtime port
- Payload v5 with note items; zod swapped for valibot
- Viewer locale-prefixed landing URLs with full i18n coverage; `/s/new` auto-extracts page titles and shows a live budget meter
- E2E suite ported from Gauge to Playwright

### Changed
- Release process documented; per-version release notes and shorter manifest description
- Experimental agent server/bridge protocol documented; bridge round-trip covered by tests

## 0.6.1

### Fixed
- Fix GitHub Release workflow to use exact file paths instead of globs for extension artifact uploads

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
