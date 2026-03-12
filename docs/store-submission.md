# Stash — Store Submission Guide

## Overview

Stash is a browser extension that lets users save a snapshot of selected tabs via a single URL. The viewer renders saved tabs in a clean card UI.

- **Extension version**: 0.1.0
- **Privacy policy**: `https://stash.oxejoq.eu/privacy`
- **Source code**: `https://github.com/[your-username]/stash` (replace with your GitHub repo URL)

---

## Pre-Submission Checklist

Before submitting to any store:

- [ ] Extension zip built (see commands below)
- [ ] Screenshots ready (1280x800 PNG in `screenshots/`)
- [ ] Privacy policy live (viewer deployed with `/privacy` route)
- [ ] Store description written (see templates below)
- [ ] Icons verified: 16×16, 48×48, 128×128 PNG in `extension/public/`

---

## Building the Extension

```bash
# Build everything (extension + viewer)
pnpm build

# Build viewer only (for Vercel deployment)
pnpm --filter stash-viewer run build

# Package extension for Chrome
pnpm --filter stash-extension run zip:chrome
# Output: apps/extension/.output/stash-extension-{version}-chrome.zip

# Build + package for Firefox
pnpm --filter stash-extension run build:firefox
pnpm --filter stash-extension run zip:firefox
# Output: apps/extension/.output/stash-extension-{version}-firefox.zip

# Create sources zip for AMO (required for Firefox)
./scripts/create-sources-zip.sh
# Output: apps/extension/.output/stash-sources-{version}.zip
```

---

## Chrome Web Store Submission

### Prerequisites
- Google developer account ($5 one-time registration fee)
- Chrome Web Store Developer Dashboard: https://chrome.google.com/webstore/devconsole

### Upload Steps

1. **Build and package**:
    ```bash
    pnpm build
    pnpm --filter stash-extension run zip:chrome
    ```

2. **Upload zip** to Chrome Web Store Developer Dashboard:
     - File: `apps/extension/.output/stash-extension-{version}-chrome.zip` (e.g., `stash-extension-0.1.0-chrome.zip`)

3. **Fill in store listing**:
    - **Name**: Stash
    - **Short description** (132 chars max): Save a snapshot of your open tabs as a shareable link. No accounts, no servers, no tracking. Come back when you're ready.
    - **Detailed description**: See template below
    - **Category**: Productivity
    - **Language**: English

4. **Upload assets**:
    - Screenshots: `screenshots/store-screenshot.png` (1280×800)
    - Icon: `extension/public/icon-128.png` (auto-detected from zip)

5. **Privacy policy**:
    - URL: `https://stash.oxejoq.eu/privacy`

6. **Submit for review** — typical review time: 1-3 business days

### Store Description Template

```
Too many tabs open? Same. Stash lets you select any tabs, save them as a shareable snapshot, and close them without losing a thing.

No accounts. No servers. No tracking. Everything lives in a simple link you can share or revisit anytime — your browser does all the work.

Perfect for researchers, engineers, founders, and anyone who lives with 40+ tabs open. Stash them. Share them. Come back when you're ready.

Install Stash — and finally close those tabs.
```

---

## Firefox Add-ons Submission

### Prerequisites
- Firefox Add-ons developer account (free)
- Firefox Add-ons Developer Hub: https://addons.mozilla.org/developers/

### Upload Steps

1. **Build and package for Firefox**:
    ```bash
    pnpm --filter stash-extension run build:firefox
    pnpm --filter stash-extension run zip:firefox
    ```

2. **Upload zip** to Firefox Add-ons Developer Hub:
     - File: `apps/extension/.output/stash-extension-{version}-firefox.zip` (e.g., `stash-extension-0.1.0-firefox.zip`)

3. **Source code** (required for Firefox review):
     - Firefox requires source code for extensions built with bundlers/minifiers
     - When asked "Do you need to submit source code?" → **Yes**
     - Create sources zip: `./scripts/create-sources-zip.sh`
     - Upload: `apps/extension/.output/stash-sources-{version}.zip`
     - Build instructions are included in the zip's `README.md`
     - See [`apps/extension/SOURCES.md`](../apps/extension/SOURCES.md) for details

4. **Fill in store listing** (same content as Chrome):
    - Name, description, category, screenshots

5. **Privacy policy**:
    - URL: `https://stash.oxejoq.eu/privacy`

6. **Submit for review** — typically faster than Chrome (hours to days)

### Firefox-Specific Notes
- Uses Manifest V2 (MV2) — fully supported in Firefox
- No special Firefox permissions beyond what Chrome requires
- Source code submission is required (bundled/minified code)
- Reviewers need to reproduce the build from source

---

## Vercel Deployment (Viewer)

The privacy policy and viewer must be deployed before store submission.

1. **Connect GitHub repo to Vercel** (one-time setup):
   - Import project at https://vercel.com/new
   - Framework: Other
   - Build settings are auto-detected from `vercel.json`

2. **Set environment variable** in Vercel dashboard:
   ```
   VITE_VIEWER_ORIGIN = https://[your-vercel-domain].vercel.app
   ```

3. **Deploy**: Vercel auto-deploys on every push to `main`

4. **Verify** privacy policy is accessible:
   ```bash
   curl https://[your-vercel-domain].vercel.app/privacy | grep -i "no data"
   ```

---

## Asset Checklist

Use this checklist before each store submission:

- [ ] `apps/extension/.output/stash-extension-{version}-chrome.zip` built with `pnpm build && pnpm --filter stash-extension run zip:chrome`
- [ ] `apps/extension/.output/stash-extension-{version}-firefox.zip` built with `pnpm --filter stash-extension run build:firefox && pnpm --filter stash-extension run zip:firefox`
- [ ] `apps/extension/.output/stash-sources-{version}.zip` created with `./scripts/create-sources-zip.sh` (Firefox only)
- [ ] `screenshots/store-screenshot.png` generated with `pnpm screenshots` (1280×800 PNG)
- [ ] Privacy policy live at `https://stash.oxejoq.eu/privacy`
- [ ] Store description reviewed and localized if needed
- [ ] Icons verified in extension zip: 16×16, 48×48, 128×128

---

## Review Timeline

| Store | Typical Review Time |
|-------|---------------------|
| Chrome Web Store | 1–3 business days |
| Firefox Add-ons | A few hours to a few days |

---

*For questions about the extension behavior, see the project [README](../README.md).*
