# Stash — Project Retrospective & Forward Strategy

**Analyzed**: 66 commits, 4 packages (`@stash/codec`, `@stash/theme`, `e2e`, and `extension`), 2 apps (`extension`, `viewer`), 15 archived implementation plans.

---

## Part 1 — Retrospective: What Should Have Been Defined Earlier

### 1. Shared codec logic as a first-class package

**What it is**: The encode/decode pipeline (`encoder.ts`, `decoder.ts`, `types.ts`, `constants.ts`) existed as duplicated copies in both `extension/lib/` and `viewer/src/lib/` before being extracted into `@stash/codec`.

**Evidence**: The `monorepo-restructure.md` plan explicitly documents the pre-existing duplication — tasks 2–4 are literally "copy types.ts from viewer/src/lib", "copy decoder.ts from viewer/src/lib" into the codec package. The `encoding-enhancement.md` plan lists its Wave 1 as "scaffold @tab-mail/codec and migrate shared logic." Git confirms: `feat(codec): scaffold @tab-mail/codec and migrate shared logic` (commit `1758481`) appeared only after the brotli migration was underway, not at project start. Two separate files with identical content survived for an extended period.

**Impact**: Every encoding/decoding change required parallel edits in two places. The monorepo restructure was a 17-task, 5-wave plan — the majority of which was path fixups caused by starting without a monorepo. The codec migration forced a codec-specific plan with 13+ tasks just to extract what should have been centralized from day one.

**Ideal early decision**: At project kickoff, define `@stash/codec` with `encoder.ts`, `decoder.ts`, `types.ts`, `constants.ts`. Extension and viewer import from the package from commit #1. This decision takes 30 minutes and saves ~100 hours of restructuring.

---

### 2. The compression format and payload schema were not locked before building

**What it is**: The project shipped with pako (zlib) + JSON as the encoding format (v1), then fully migrated to brotli-wasm + a custom delimiter format (v2) — with a clean break (no backward compatibility). This migration was substantial enough to require its own 1,000-line implementation plan.

**Evidence in the codebase**:
- `packages/codec/package.json` still lists `"pako": "^2.1.0"` as a **live dependency** despite no file in `packages/codec/src/` importing it — pako is now dead weight
- The README still says "Compressed payload using pako" (line 14 of `README.md`) — documentation from v1 that was never updated
- `decoder.ts` hardcodes `https://` restoration: `url = "https://" + urlWithoutScheme` — silently converting `http://` URLs to `https://` (data mutation by design, but never surfaced to users)
- The `roundtrip.test.ts` file (line 12) imports `BrotliFunctions` from `"./types.js"` — a path that resolves to `packages/codec/src/__tests__/types.js` which **does not exist**. This is a latent bug in the only automated tests.

**Impact**: The brotli migration required auditing every caller of `encodePayload` and `decodeShareUrl` across both apps, converting them to async, updating CI env vars, and bumping `PAYLOAD_VERSION`. A format/schema contract defined early (with versioning) would have made this evolutionary rather than disruptive.

**Ideal early decision**: Define the wire format spec upfront as a versioned contract document. Choose brotli from the start (it offers better compression for short strings than zlib and is natively supported in modern browsers via WASM). Lock the delimiter format once and treat it as a protocol. Any future change must be backward-compatible by preserving version detection at the decoder.

---

### 3. Brotli initialization was never centralized despite being the entire point of `@stash/codec`

**What it is**: The `BrotliFunctions` interface is defined in `@stash/codec/src/types.ts`, but the initialization code is duplicated in two app-specific files with different import syntax and subtle implementation differences.

**Evidence**:

`apps/extension/lib/brotli.ts`:
```typescript
import * as brotliPromise from "brotli-wasm";
// ...
const brotliModule = await brotliPromise.default;
```

`apps/viewer/src/lib/brotli.ts`:
```typescript
import brotliWasm from "brotli-wasm";
// ...
const brotliModule = await brotliWasm;
```

These are not equivalent — `.default` unwrapping vs direct await can behave differently depending on the module bundler. They use different import styles for the same package, suggesting they were written independently rather than shared. The codec package currently exports only the **interface** (`BrotliFunctions`) without providing the singleton factory that every caller needs.

**Impact**: Two subtly different brotli init paths. If brotli-wasm behavior differs between the extension (WXT/Vite) and viewer (Astro/Vite) bundle environments, debugging will be non-trivial. Every future app that uses `@stash/codec` (e.g., a CLI tool, a Node.js API) must re-implement the same singleton pattern.

**Ideal early decision**: Either (a) make `@stash/codec` export a `getBrotliFunctions()` factory that handles environment-specific import differences, or (b) accept the injection pattern but publish a canonical implementation in `packages/codec/src/brotli.ts` as the reference. Currently the codec package does neither.

---

### 4. Extension-idiomatic storage was never adopted

**What it is**: Settings (expiry mode, viewer origin) are stored in `localStorage` rather than the browser-native `browser.storage.local` (or `browser.storage.sync`).

**Evidence in `apps/extension/lib/settings.ts`**:
```typescript
const SETTINGS_STORAGE_KEY = "tabshare-settings" as const;  // ← old brand artifact
// ...
localStorage.getItem(SETTINGS_STORAGE_KEY)
```

Three problems in one line:
1. The key is `"tabshare-settings"` — the old TabShare brand, not "stash". Any user who installed during the TabShare era has settings under a different key. The Stash branding can't migrate these settings without a migration path.
2. `localStorage` in a WXT extension popup is **not** equivalent to `browser.storage.local`. In Chrome MV3, the popup has its own ephemeral context — `localStorage` from the popup and from the background service worker are the **same origin** only on Firefox. On Chrome, these may diverge.
3. The `settings-cache.ts` module exists as a workaround: it adds a module-level in-memory cache because `getSettings()` reads from `localStorage` synchronously on every call. This is a symptom of the wrong storage API.

**Impact**: Settings appear to work in testing but may behave inconsistently in production across browsers. The cache invalidation mechanism (`invalidateSettingsCache()`) is a layered fix on top of the wrong foundation. The brand artifact means any user who ever used the old `tabshare-settings` key will silently use default settings under the new key.

**Ideal early decision**: Use `browser.storage.sync` (shared across devices) or `browser.storage.local` (extension-native, works consistently across Chrome and Firefox). WXT's `useStorageItem()` composable makes this trivial. The settings shape is small (two fields); there's no performance reason to avoid async storage access.

---

### 5. The project's own identity was deferred

**What it is**: The project underwent two rebrands (tab-mail → TabShare → Stash) during active development, and the artifacts of each incarnation are still present.

**Evidence across the codebase**:
- The repository folder is named `tab-mail` (the original project name)
- `settings.ts` uses key `"tabshare-settings"` (TabShare era)
- `wxt.config.ts` declares version `0.1.0` (pre-release, never bumped)
- The `@stash/codec` and `@stash/theme` packages are named correctly (Stash)
- The CI deploy target is `https://stash.oxejoq.eu` (private deployment domain, not a user-facing domain)
- The README documents a v1 pako encoding pipeline that no longer exists
- The popup's "settings" button is labeled with `className="theme-toggle"` (residual from when it was a theme button)

**Impact**: Developer friction — git clone produces a folder named `tab-mail`, but every file says `Stash`. Confusion for contributors. The version is still `0.1.0` across all packages regardless of how many breaking changes happened (v1→v2 codec format is definitionally a breaking change). Users who somehow have old settings under `tabshare-settings` get reset to defaults silently.

**Ideal early decision**: Lock the name, domain, and version policy before building features. Define: "When does 0.1.0 become 1.0.0?" (answer: when the extension is on the store). Semantic versioning for the codec package matters the moment two apps depend on it — a codec format change is a major version bump.

---

## Part 2 — Forward Strategy: The Next Key Unlocks

### 1. A landing page that converts link recipients into users

**What it is**: Add a proper home page at `/` that explains Stash, shows a demo, and has a single CTA: "Add to Chrome / Add to Firefox."

**Why it matters for retention/growth**: The current `/` returns nothing (or an Astro 404). Every person who receives a Stash link and clicks through to `/s/#p=...` sees the shared tabs — but has no path to become a user. This is the highest-leverage conversion opportunity: the audience is already warm (someone sent them a link worth clicking). A landing page with "Get the extension — share your own tabs in one click" captures that moment.

**Where to start**: Add `apps/viewer/src/pages/index.astro`. Mirror the card styling already established in `privacy.astro`. The design system (`@stash/theme`, CSS custom properties) is already there. The page should embed a real encoded URL as a demo — users can click and see the viewer working immediately.

**Effort vs. impact**: Low effort (1 page, existing design system). High impact — this is the entire top-of-funnel.

---

### 2. Extension store presence (the actual unlock)

**What it is**: Publish Stash to the Chrome Web Store and Firefox Add-ons. The infrastructure is already built (`zip:chrome`, `zip:firefox`, `create-sources-zip.sh`, `SOURCES.md`).

**Why it matters for retention/growth**: Browser extension discovery happens almost entirely through the store. Right now, there is no way for a non-developer to install Stash — it requires loading an unpacked extension or getting a direct download. Zero organic discovery. Store presence also unlocks: user reviews (social proof), automatic updates, and browser integration (install button on the landing page).

**Where to start**: The CI already builds and produces `.output/stash-extension-*-chrome.zip`. The gap is:
1. Creating the Chrome Web Store developer account and filling the listing
2. Recording a 1-minute demo screencast (required for store review)
3. Linking the production Vercel URL as `VITE_VIEWER_ORIGIN` (currently `https://stash.oxejoq.eu`)

**Effort vs. impact**: Medium effort (store submission process, marketing copy, screenshots). Extremely high impact — this is the distribution unlock that everything else depends on.

---

### 3. Link history in the popup (the retention flywheel)

**What it is**: After a user creates a share link, save it to `browser.storage.local` with a timestamp and item count. Show the last N created links in the popup with one-click re-copy.

**Why it matters for retention/growth**: Currently, if a user creates a link and loses it (browser notification dismissed, forgot to paste), it's gone forever. There's no reason to open the popup again unless you need to share something right now. A history list gives users a reason to return — "let me grab that link I shared yesterday." It also enables the first power user behavior: maintaining a personal stash of curated tab sets.

**Where to start**: 
- `apps/extension/entrypoints/popup/` — add a "History" tab or collapsible history section in `App.tsx`
- `apps/extension/lib/settings.ts` — extend with history storage using `browser.storage.local`
- This also forces the migration from `localStorage` to `browser.storage.*` (fixing Retrospective Issue #4)

**Effort vs. impact**: Medium effort (React UI + storage layer). High impact — the feature that transforms Stash from "try once" to "open weekly."

---

### 4. Fix the Chrome context menu gap

**What it is**: The right-click "Share selected tabs…" context menu is **Firefox-only** (`if (import.meta.env.FIREFOX)`). Chrome users must use the popup — a slower flow that requires opening the extension popup and manually creating the link.

**Why it matters for retention/growth**: Chrome has 65%+ browser market share. Power users prefer context menus over popup UI. The faster the sharing flow, the more likely users repeat the behavior. This is a core workflow gap for the majority of users.

**Where to start**: `apps/extension/entrypoints/background.ts`. The guard was added as a bugfix (commit `60dbe63`) — investigate _why_ Chrome's context menu registration failed (likely a timing issue with the service worker lifecycle in MV3) and fix it properly. The solution is usually: register the context menu in `onInstalled` (already done) and ensure the manifest permissions include `contextMenus` (already present in `wxt.config.ts`). The actual issue may have been a different Chrome MV3 quirk unrelated to context menus themselves.

**Effort vs. impact**: Low-to-medium effort (investigation + targeted fix). High impact for Chrome users, which is the majority audience.

---

### 5. Shareable URL improvements: QR code and Web Share API

**What it is**: Add two sharing augmentations to the popup `LinkResult` component: (a) a QR code for the share URL, and (b) a "Share via..." button using the Web Share API (Chrome 89+, Firefox 115+).

**Why it matters for retention/growth**: The share link is currently copied as a raw ~500-char URL — not human-friendly and impossible to share verbally or on mobile. QR codes enable the core use case of "I'm on my laptop, share these tabs to my phone" without needing a relay service. The Web Share API opens the OS-native share sheet (email, messages, AirDrop) — making Stash feel like a first-class sharing tool, not a URL-copy hack.

**Where to start**:
- `apps/extension/entrypoints/popup/components/LinkResult.tsx` — add a `<canvas>` QR code (using `qrcode` package, 3KB gzipped) and a Share button
- Check `navigator.share` availability before rendering the button
- The existing `handleCopy` pattern already shows the right UX pattern to follow

**Effort vs. impact**: Low effort (small component addition, one lightweight dependency). Medium impact — improves the UX of the core action without changing the architecture.

---

## Summary Table

### Retrospective Issues

| Issue | Category | Severity |
|---|---|---|
| Codec not centralized from day 0 | Architecture | High — caused 2 major restructures |
| Payload format not locked before shipping | Protocol | High — caused full breaking migration |
| Brotli init not in codec package | Architecture | Medium — latent divergence risk |
| `localStorage` instead of `browser.storage.*` | Extension idioms | Medium — subtle multi-browser bugs |
| Brand/identity artifacts | Hygiene | Low — developer friction, user confusion |

### Forward Unlocks

| Unlock | Leverage | Effort | Impact |
|---|---|---|---|
| Landing page at `/` | Top-of-funnel conversion | Low | High |
| Store submission | Distribution | Medium | Extremely High |
| Link history in popup | Retention flywheel | Medium | High |
| Chrome context menu | Core UX parity | Low-Medium | High |
| QR code + Web Share | Sharing UX | Low | Medium |

---

## Final Note

The single highest-ROI move: **get on the Chrome Web Store**. Every other improvement — the landing page, the history feature, the context menu — compounds once there's organic discovery driving new installs. Right now the product is technically complete but distribution-locked.
