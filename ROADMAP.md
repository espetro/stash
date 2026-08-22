# Stash Roadmap

Last updated: Aug 22, 2026 · Current release: **v0.7.1** (v0.8.0 in flight)

---

## Shipped — Stash v2 (v0.8.0)

Unified AI-first session manager. All of it landed in v0.8.0:

- [x] Payload schema v6 with optional tags and note (decoder accepts v4/v5/v6)
- [x] Local stash library in the extension (`browser.storage.local`) plus My Stashes UI in popup and viewer
- [x] Local MCP server in the extension (snapshot tabs, list/get/create/update/delete/search stashes)
- [x] Opt-in short links with fail-closed rate limiting and a 7-day TTL ceiling
- [x] Agent JSON endpoints (`/json`, `/md`, `/s`) with tags and note surfaced in the OpenAPI schema
- [x] Anonymous aggregate telemetry (Cloudflare Analytics Engine + optional PostHog)

---

## Now — Feature Parity (v0.6.0)

Unify the stash creation and viewing experience across all three surfaces: extension popup, viewer web app, and HeroStashPopup (landing page embed).

### Extract Shared Components → `@stash/shared`

The extension and viewer duplicate UI patterns. Extract to `@stash/shared` so all three surfaces use the same components.

- [ ] **StashCard** — result display: generated URL, copy button, clear action
- [ ] **TabList / TabItem** — tab row with favicon, title, URL, external link
- [ ] **ExpirySelector** — dropdown/radio for link expiry
- [ ] **useEncode** hook — Brotli + msgpack encoding + payload creation (currently duplicated in `useStashForm` and extension encoder)

### Extension → Viewer Capabilities

The extension generates links but can't view them. Add:

- [ ] Decode stash URLs (reuse `decodeShareUrl` from `@stash/codec`)
- [ ] Tab list rendering in result view (reuse shared TabList)
- [ ] QR code rendering (currently only generates URL — add inline SVG via shared worker)
- [ ] JSON/Markdown export (reuse ShareDrawer pattern)

### Viewer → Extension Parity

- [ ] Budget indicator on `/s/new` form (chars used / max, tab count)

### Quick Wins

- [ ] Fix CI Node version (`ci.yml`: 20 → 22 to match `.node-version`)
- [ ] Add `pnpm run validate` as pre-commit hook (scripts exist, hook doesn't)

---

## Next — Growth (v0.7.0)

Once all surfaces have feature parity, focus on distribution and user validation.

- [ ] PostHog analytics in extension (currently viewer-only)
- [ ] Landing page SEO pass (meta tags, Open Graph, structured data)
- [ ] Share drawer improvements (copy as plain text, copy as HTML)
- [ ] History view in viewer (currently extension-only)
- [ ] Chrome Web Store listing optimization (screenshots, description, keywords)
- [ ] Firefox Add-ons listing parity
- [ ] E2E test suite activation (Gauge + Playwright specs exist but aren't in CI)

### HeroStashPopup → Full Parity

Currently: title + URL input + expiry + encode + copy. Missing:

- [ ] Budget indicator (chars remaining / tab count)
- [ ] Error state UI (validation feedback, not just "Error" label)
- [ ] Theme-aware styling (currently hardcoded dark CSS vars)
- [ ] Tab count preview before encoding
- [ ] Mobile-responsive adjustments

---

## Later — Scale (v0.8.0+)

Future milestones. Re-evaluate after v0.7.0 user data.

- [ ] Starlight documentation site (`/docs`)
- [x] OpenAPI spec promotion (surfaced via `/llms.txt` and MCP server card for agent discovery)
- [x] User-configurable expiry durations (1, 7, 14, 30 days)
- [x] Custom viewer origin (self-hosted viewer support, `VITE_VIEWER_ORIGIN`)
- [x] Storage migration path (versioned payload format v6 with v4/v5 backwards compatibility)
- [ ] Release automation (`release.yml` exists — add automated changelog generation)

---

## Parking Lot

Ideas from `.omo/plans/` that are deprioritized. Revisit if user demand exists.

- Share hub UI (public gallery of shared stashes)
- Theme marketplace
- Tab thumbnails / previews
- Browser sidebar panel
- Mobile companion app

---

## Architecture Principles

1. **No server, no account** — URL-encoded payload is the core differentiator
2. **Shared packages first** — new features go to `@stash/codec` or `@stash/shared`, not duplicated
3. **Budget-aware** — 8000-char URL budget constrains everything; show it to users
4. **Three surfaces, one experience** — extension, viewer, and landing embed should feel identical
