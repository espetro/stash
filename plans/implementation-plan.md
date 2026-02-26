# TabShare Browser Extension - POC Implementation Plan

## Overview

Implement a cross-browser extension (using WXT) that enables users to share snapshots of selected tabs via URL-encoded links. The project consists of:
1. **Browser Extension** - Captures tabs and generates share links
2. **Viewer Site** (Astro) - Renders shared tabs in a centered card UI

## User Preferences
- Viewer URL: Start with localhost, update domain before production
- Behavior: Copy link to clipboard only (no auto-open)
- Folder naming: Show folder icon + item count (e.g., "12 Items")
- Icons: Use Lucide or similar icon library for extension icons

---

## Project Structure

```
tab-mail/
├── extension/              # WXT browser extension
│   ├── entrypoints/
│   │   └── background.ts   # Service worker (context menu, clipboard)
│   ├── lib/
│   │   ├── encoder.ts      # Payload encoding + budget enforcement
│   │   ├── types.ts        # Shared TypeScript interfaces
│   │   └── constants.ts    # BUDGET_CHARS, VIEWER_ORIGIN, etc.
│   ├── public/
│   │   ├── icon-16.png
│   │   ├── icon-48.png
│   │   └── icon-128.png
│   ├── wxt.config.ts
│   ├── package.json
│   └── tsconfig.json
│
├── viewer/                 # Astro static site
│   ├── src/
│   │   ├── pages/
│   │   │   └── s.astro     # Viewer page at /s/
│   │   ├── lib/
│   │   │   ├── decoder.ts  # Payload decoding
│   │   │   ├── types.ts    # Same as extension
│   │   │   └── constants.ts # Same as extension
│   │   └── layouts/
│   │       └── Layout.astro
│   ├── astro.config.mjs
│   ├── package.json
│   └── tsconfig.json
│
├── package.json            # Root workspace config
└── README.md
```

---

## Implementation Steps

### 1. Project Initialization

#### 1.1 Setup Root Workspace
```bash
cd /Users/joaquin.terrasamoya/Documents/prjcts/_own/tab-mail
npm init -y
```

Edit `package.json`:
```json
{
  "name": "tab-mail",
  "private": true,
  "workspaces": ["extension", "viewer"],
  "scripts": {
    "dev:ext": "npm run dev --workspace=extension",
    "dev:view": "npm run dev --workspace=viewer",
    "build": "npm run build --workspace=extension && npm run build --workspace=viewer"
  }
}
```

#### 1.2 Initialize Extension
```bash
mkdir extension && cd extension
npm init -y
npm install -D wxt typescript @types/pako @types/chrome
npm install pako
```

**`extension/package.json` scripts:**
```json
{
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "zip": "wxt zip"
  }
}
```

#### 1.3 Initialize Viewer
```bash
cd /Users/joaquin.terrasamoya/Documents/prjcts/_own/tab-mail
mkdir viewer && cd viewer
npm create astro@latest . -- --template minimal --typescript strict --no-git
npm install pako @types/pako
```

**`viewer/package.json` scripts:**
```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  }
}
```

#### 1.4 Create .gitignore
```
node_modules/
.output/
dist/
.wxt/
.astro/
```

---

### 2. Extension Implementation

#### 2.1 Constants (`extension/lib/constants.ts`)
```typescript
export const PAYLOAD_VERSION = 1;
export const EXPIRY_HOURS = 24;
export const BUDGET_CHARS = 8000;
export const MAX_TITLE_CHARS = 30;
export const VIEWER_ORIGIN = 'http://localhost:4321'; // Update before production
export const VIEWER_PATH = '/s/';
```

#### 2.2 Types (`extension/lib/types.ts`)
```typescript
export interface SharePayload {
  v: number;           // Schema version
  e: number;           // Expiry timestamp (Unix seconds)
  i: [string, string][]; // Items: [url, title][]
}

export interface TabInfo {
  url: string;
  title: string;
}

export interface EncodingResult {
  url: string;
  itemCount: number;
  truncated: boolean;
}
```

#### 2.3 Encoder (`extension/lib/encoder.ts`)

**Key Functions:**
- `normalizeTitle(title: string): string` - Trim, collapse whitespace, truncate to MAX_TITLE_CHARS
- `createPayload(tabs: TabInfo[]): SharePayload` - Build payload with expiry (now + 24h)
- `encodePayload(payload: SharePayload): string` - JSON → UTF-8 → compress (pako) → base64url
- `buildShareUrl(encoded: string): string` - `${VIEWER_ORIGIN}${VIEWER_PATH}#p=${encoded}`
- `findMaxTabsWithinBudget(tabs: TabInfo[]): number` - Binary search for max tabs that fit
- `encodeTabsToShareUrl(tabs: TabInfo[]): EncodingResult` - Main entry point

**Encoding Pipeline:**
1. Normalize titles (30 char max)
2. Create payload `{v: 1, e: timestamp, i: [[url, title], ...]}`
3. JSON.stringify (no whitespace)
4. TextEncoder → UTF-8 bytes
5. pako.deflate → compressed bytes
6. btoa + URL-safe replacements → base64url
7. Build URL: `${VIEWER_ORIGIN}${VIEWER_PATH}#p=${base64url}`
8. If length > 8000, binary search for max subset

**Budget Enforcement:**
- Try full tab set first
- If exceeds BUDGET_CHARS, binary search to find max prefix
- Return `{url, itemCount, truncated: true}` if truncated

#### 2.4 Background Service Worker (`extension/entrypoints/background.ts`)

```typescript
export default defineBackground(() => {
  // Create context menu on install
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: 'share-tabs',
      title: 'Share selected tabs…',
      contexts: ['tab']
    });
  });

  // Handle context menu clicks
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'share-tabs') return;

    try {
      // Query highlighted tabs (multi-selected)
      const tabs = await browser.tabs.query({
        highlighted: true,
        currentWindow: true
      });

      if (tabs.length === 0) return;

      // Extract tab info
      const tabInfos = tabs
        .filter(t => t.url && t.title)
        .map(t => ({ url: t.url!, title: t.title! }));

      // Encode to share URL
      const result = encodeTabsToShareUrl(tabInfos);

      // Copy to clipboard
      await navigator.clipboard.writeText(result.url);

      // Show notification
      const message = result.truncated
        ? `Link copied! ${result.itemCount} of ${tabInfos.length} tabs shared (URL budget reached)`
        : `Link copied! ${result.itemCount} tab${result.itemCount > 1 ? 's' : ''} shared`;

      await browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icon-48.png'),
        title: 'TabShare',
        message
      });

    } catch (error) {
      console.error('Failed to share tabs:', error);
      await browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icon-48.png'),
        title: 'TabShare Error',
        message: 'Failed to create share link'
      });
    }
  });
});
```

#### 2.5 WXT Config (`extension/wxt.config.ts`)
```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'TabShare',
    description: 'Share selected tabs with snapshot links',
    version: '0.1.0',
    permissions: ['contextMenus', 'tabs', 'clipboardWrite', 'notifications'],
    icons: {
      16: '/icon-16.png',
      48: '/icon-48.png',
      128: '/icon-128.png'
    }
  }
});
```

#### 2.6 Extension Icons
Use **Lucide Icons** or similar. Download/generate:
- `extension/public/icon-16.png` - 16x16 folder icon
- `extension/public/icon-48.png` - 48x48 folder icon
- `extension/public/icon-128.png` - 128x128 folder icon

Suggested: Use a blue/purple folder icon to match viewer theme.

---

### 3. Viewer Implementation

#### 3.1 Astro Config (`viewer/astro.config.mjs`)
```javascript
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'http://localhost:4321', // Update before production
  output: 'static',
  build: {
    format: 'file'
  }
});
```

#### 3.2 Constants & Types (`viewer/src/lib/`)
Copy `constants.ts` and `types.ts` from extension:
```bash
cp extension/lib/constants.ts viewer/src/lib/
cp extension/lib/types.ts viewer/src/lib/
```

#### 3.3 Decoder (`viewer/src/lib/decoder.ts`)

**Key Functions:**
- `decodeShareUrl(fragment: string): DecodedPayload` - Main decoder
- `getDomain(url: string): string` - Extract domain from URL
- `getFaviconUrl(url: string): string` - Get Google favicon URL

**Decoding Pipeline:**
1. Extract `#p=...` from URL fragment
2. Convert base64url → base64 (add padding)
3. atob → binary string → Uint8Array
4. pako.inflate → decompressed bytes
5. TextDecoder → UTF-8 string
6. JSON.parse → SharePayload
7. Validate schema version and structure
8. Check expiry (compare timestamp to now)
9. Return `{version, expiry, items, isExpired}`

**Error Handling:**
- Throw `PayloadDecodeError` for invalid payloads
- Validate version matches PAYLOAD_VERSION
- Validate expiry is a valid timestamp
- Validate items is an array of [url, title] tuples

#### 3.4 Base Layout (`viewer/src/layouts/Layout.astro`)
```astro
---
interface Props {
  title: string;
}
const { title } = Astro.props;
---
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <style is:global>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
  </style>
</head>
<body>
  <slot />
</body>
</html>
```

#### 3.5 Viewer Page (`viewer/src/pages/s.astro`)

**Structure:**
- Container with purple gradient background
- Three states: loading, error/expired, content
- Card with:
  - Header: Folder icon (📁) + "X Items" title
  - Actions: "Open All Tabs", "Copy URLs" buttons
  - Tab list: Scrollable list with favicons + titles

**Client-side Script:**
1. On page load, read `window.location.hash`
2. Call `decodeShareUrl(fragment)`
3. If expired, show expired state
4. If valid, render content:
   - Set item count: `"${count} Item${count !== 1 ? 's' : ''}"`
   - For each item, create list item with:
     - Favicon: `<img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32">`
     - Title (truncated in CSS)
     - Link to URL (opens in new tab)
5. Wire up buttons:
   - "Open All": `window.open(url, '_blank')` for each item
   - "Copy URLs": Copy all URLs separated by newlines

**Styling (matching mockup):**
- Background: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`
- Card: White, rounded corners (16px), shadow, max-width 600px
- Header: Folder icon (3rem), title (1.5rem bold), no subtitle
- Actions: Purple primary button, gray secondary button
- Tab list: Max height 400px, scrollable, items with hover effect
- Favicon: 20x20, hide if fails to load
- Title: Truncate with ellipsis

---

### 4. Build & Development Workflow

#### Development (Local Testing)
```bash
# Terminal 1: Run extension
npm run dev:ext

# Terminal 2: Run viewer
npm run dev:view
```

1. Extension loads at `chrome://extensions/` (auto-reload)
2. Viewer runs at `http://localhost:4321`
3. Test flow:
   - Open multiple tabs
   - Multi-select (Cmd/Ctrl + Click)
   - Right-click → "Share selected tabs…"
   - Paste URL into browser
   - Verify viewer loads correctly

#### Production Build
```bash
# Build extension (Chrome)
npm run build --workspace=extension

# Build extension (Firefox)
npm run build:firefox --workspace=extension

# Build viewer
npm run build --workspace=viewer
```

**Before production:**
1. Update `VIEWER_ORIGIN` in `extension/lib/constants.ts`
2. Update `site` in `viewer/astro.config.mjs`
3. Deploy `viewer/dist/` to static host (Cloudflare Pages, Vercel, Netlify)
4. Rebuild extension with production URL
5. Create zip: `npm run zip --workspace=extension`

#### Chrome Store Submission
1. Build: `npm run build --workspace=extension`
2. Zip: `npm run zip --workspace=extension`
3. Upload `.output/chrome-mv3-prod.zip` to Chrome Web Store
4. Provide: Description, icons, screenshots, privacy policy

#### Firefox Add-ons Submission
1. Build: `npm run build:firefox --workspace=extension`
2. Zip: `npm run zip:firefox --workspace=extension`
3. Upload `.output/firefox-mv2-prod.zip` to Firefox Add-ons
4. Provide: Description, icons, screenshots, privacy policy

---

## Critical Files (Implementation Order)

### Phase 1: Core Logic
1. `extension/lib/constants.ts` - Define all constants
2. `extension/lib/types.ts` - TypeScript interfaces
3. `extension/lib/encoder.ts` - Encoding + budget logic (CRITICAL)
4. `viewer/src/lib/decoder.ts` - Decoding + validation (CRITICAL)

### Phase 2: Extension
5. `extension/wxt.config.ts` - WXT configuration
6. `extension/entrypoints/background.ts` - Service worker (CRITICAL)
7. `extension/public/icon-*.png` - Extension icons

### Phase 3: Viewer
8. `viewer/astro.config.mjs` - Astro configuration
9. `viewer/src/layouts/Layout.astro` - Base layout
10. `viewer/src/pages/s.astro` - Viewer page (CRITICAL)

### Phase 4: Config
11. `package.json` (root) - Workspace config
12. `extension/package.json` - Dependencies + scripts
13. `viewer/package.json` - Dependencies + scripts
14. `.gitignore` - Ignore build outputs

---

## Verification & Testing

### Unit Testing (Manual)
**Encoder:**
1. Test with 1 tab → verify URL format
2. Test with 10 tabs → verify all encoded
3. Test with 100 tabs → verify budget enforcement (truncation)
4. Test with long titles → verify truncation to 30 chars
5. Test with special chars → verify encoding/decoding

**Decoder:**
1. Valid payload → should decode correctly
2. Expired payload → should flag as expired
3. Invalid payload → should throw error
4. Tampered payload → should throw error

### Integration Testing
**End-to-End Flow:**
1. Install extension in Chrome (dev mode)
2. Open 5 tabs (e.g., GitHub, Stack Overflow, MDN, etc.)
3. Multi-select all tabs (Cmd+Click or Shift+Click)
4. Right-click on selected tab
5. Click "Share selected tabs…"
6. Verify notification: "Link copied! 5 tabs shared"
7. Open new tab and paste URL
8. Verify viewer loads with:
   - Purple gradient background
   - White card centered
   - Folder icon + "5 Items"
   - List of 5 items with favicons
   - "Open All Tabs" and "Copy URLs" buttons work

**Cross-browser:**
- Repeat above in Chrome, Firefox, Edge
- Verify context menu works
- Verify clipboard API works
- Verify multi-tab selection works

**Edge Cases:**
- Single tab selection → should work
- 50+ tabs → should truncate with notification
- Tabs with no title → should use URL as title
- Invalid URLs → should filter out
- Expired link (manual test: modify timestamp) → should show expired state

### Production Verification
1. Deploy viewer to production URL
2. Update `VIEWER_ORIGIN` in extension
3. Build production extension
4. Test full flow with production URLs
5. Verify on clean browser profile
6. Check console for errors
7. Verify all icons load correctly
8. Test on mobile (viewer is responsive)

---

## Future Enhancements (Post-POC)

1. **Popup UI** - Let user name folder before sharing
2. **Settings** - Configure auto-open, expiry time, URL budget
3. **Export** - Download as bookmarks HTML, JSON export
4. **Viewer Enhancements** - Dark mode, search/filter, categorize by domain
5. **Analytics** - Privacy-respecting usage stats (client-side only)

---

## Troubleshooting

**Context menu doesn't appear:**
- Check `contextMenus` permission in manifest
- Reload extension
- Check browser console for errors

**Clipboard not working:**
- Ensure `clipboardWrite` permission exists
- Check if browser blocks clipboard API (HTTPS required in production)

**Payload too large:**
- Verify BUDGET_CHARS = 8000
- Check binary search logic
- Try with fewer tabs

**Viewer shows error:**
- Open dev tools → check console
- Verify payload format in URL
- Test with known-good payload from extension

**Favicons not loading:**
- Check network tab (may be blocked by adblocker)
- Implement fallback icon
- Use different favicon service if needed

---

## Summary

This plan provides a complete roadmap to build the TabShare POC with:
- ✅ WXT-based browser extension (Chrome + Firefox)
- ✅ Context menu for multi-tab sharing
- ✅ No-backend URL encoding (8000 char budget)
- ✅ Astro viewer with card UI matching mockup
- ✅ 24-hour client-side expiry
- ✅ Installation from GitHub or browser stores

**Total Implementation Time:** ~2-3 weeks for experienced developer, ~4 weeks for learning WXT/Astro.

**Key Success Criteria:**
1. User can select 5+ tabs → right-click → "Share tabs" → link copied
2. Pasting link opens viewer with centered card showing all tabs
3. Favicons load, titles truncated correctly
4. "Open All" and "Copy URLs" buttons work
5. Expired links show expired state
6. Works in Chrome and Firefox
