# TabShare - Browser Extension

A cross-browser extension that enables users to share snapshots of selected tabs via URL-encoded links.

## Overview

TabShare consists of two parts:

1. **Browser Extension** - Captures tabs and generates share links
2. **Viewer Site** (Astro) - Renders shared tabs in a centered card UI

## Features

- Share multiple tabs with a single URL
- URL budget enforcement (8000 character limit)
- Automatic expiry after 24 hours
- Cross-browser support (Chrome, Firefox, Edge)
- Compressed payload using pako
- Clean, modern UI with purple gradient theme

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
│   │   ├── icon-16.svg
│   │   ├── icon-48.svg
│   │   └── icon-128.svg
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

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

1. Install dependencies:
```bash
npm install
```

2. Build the extension:
```bash
npm run build --workspace=extension
```

3. Build the viewer:
```bash
npm run build --workspace=viewer
```

## Development

### Local Development

```bash
# Terminal 1: Run extension in development mode
npm run dev:ext

# Terminal 2: Run viewer in development mode
npm run dev:view
```

The extension will be available at `chrome://extensions/` (or Firefox equivalent) and the viewer will run at `http://localhost:4321`.

### Testing

1. Install the extension in Chrome (dev mode)
2. Open 5 tabs (e.g., GitHub, Stack Overflow, MDN, etc.)
3. Multi-select all tabs (Cmd+Click or Shift+Click)
4. Right-click on selected tab
5. Click "Share selected tabs…"
6. Verify notification: "Link copied! 5 tabs shared"
7. Open new tab and paste URL
8. Verify viewer loads with the shared tabs

## Production Deployment

### Before Production

1. Update `VIEWER_ORIGIN` in [`extension/lib/constants.ts`](extension/lib/constants.ts:1)
2. Update `site` in [`viewer/astro.config.mjs`](viewer/astro.config.mjs:1)
3. Deploy `viewer/dist/` to static host (Cloudflare Pages, Vercel, Netlify)
4. Rebuild extension with production URL
5. Create zip: `npm run zip --workspace=extension`

### Chrome Store Submission

1. Build: `npm run build --workspace=extension`
2. Zip: `npm run zip --workspace=extension`
3. Upload `.output/chrome-mv3-prod.zip` to Chrome Web Store
4. Provide: Description, icons, screenshots, privacy policy

### Firefox Add-ons Submission

1. Build: `npm run build:firefox --workspace=extension`
2. Zip: `npm run zip --workspace=extension`
3. Upload `.output/firefox-mv2-prod.zip` to Firefox Add-ons
4. Provide: Description, icons, screenshots, privacy policy

## Configuration

### Extension Constants

Edit [`extension/lib/constants.ts`](extension/lib/constants.ts:1):

```typescript
export const PAYLOAD_VERSION = 1;
export const EXPIRY_HOURS = 24;
export const BUDGET_CHARS = 8000;
export const MAX_TITLE_CHARS = 30;
export const VIEWER_ORIGIN = 'http://localhost:4321'; // Update before production
export const VIEWER_PATH = '/s/';
```

### Viewer Config

Edit [`viewer/astro.config.mjs`](viewer/astro.config.mjs:1):

```javascript
export default defineConfig({
  site: 'http://localhost:4321', // Update before production
  output: 'static',
  build: {
    format: 'file'
  }
});
```

## How It Works

### Encoding Pipeline (Extension)

1. Normalize titles (30 char max)
2. Create payload `{v: 1, e: timestamp, i: [[url, title], ...]}`
3. JSON.stringify (no whitespace)
4. TextEncoder → UTF-8 bytes
5. pako.deflate → compressed bytes
6. btoa + URL-safe replacements → base64url
7. Build URL: `${VIEWER_ORIGIN}${VIEWER_PATH}#p=${base64url}`
8. If length > 8000, binary search for max subset

### Decoding Pipeline (Viewer)

1. Extract `#p=...` from URL fragment
2. Convert base64url → base64 (add padding)
3. atob → binary string → Uint8Array
4. pako.inflate → decompressed bytes
5. TextDecoder → UTF-8 string
6. JSON.parse → SharePayload
7. Validate schema version and structure
8. Check expiry (compare timestamp to now)
9. Return `{version, expiry, items, isExpired}`

## License

This fork is licensed under the GNU Affero General Public License v3.0 (AGPL‑3.0‑only).

The original project, [dylanfeltus/otto-canvas](https://github.com/dylanfeltus/otto-canvas), is licensed under the MIT License. Portions of this fork are derived from that project and remain available under the terms of the MIT License as originally granted by its authors.

New contributions specific to this fork are licensed under AGPL‑3.0‑only.

See the [LICENSE](./LICENSE) file for the full license text, or refer to https://github.com/espetro/otto-canvas/blob/main/LICENSE.
