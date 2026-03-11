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
- pnpm

### Setup

1. Install dependencies:
```bash
pnpm install
```

2. Build the extension:
```bash
pnpm run build
```

3. Build the viewer:
```bash
pnpm run build
```

## Development

### Local Development

```bash
# Terminal 1: Run extension in development mode
pnpm run dev:ext

# Terminal 2: Run viewer in development mode
pnpm run dev:view
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
4. Rebuild both packages with production URL: `pnpm run build` (Turborepo builds extension and viewer together)
5. Create zip: `pnpm --filter tab-mail-extension run zip:chrome` (or `zip:firefox`)

### Chrome Store Submission

1. Build: `pnpm run build`
2. Zip: `pnpm --filter tab-mail-extension run zip:chrome`
3. Upload `extension/.output/tab-mail-extension-{version}-chrome.zip` to Chrome Web Store
4. Provide: Description, icons, screenshots, privacy policy

### Firefox Add-ons Submission

1. Build: `pnpm --filter tab-mail-extension run build:firefox`
2. Zip: `pnpm --filter tab-mail-extension run zip:firefox`
3. Upload `.output/tab-mail-extension-{version}-firefox.zip` to Firefox Add-ons
4. **Source code required:** Run `./scripts/create-sources-zip.sh` and upload the generated sources zip
5. Provide: Description, icons, screenshots, privacy policy

See [`extension/SOURCES.md`](extension/SOURCES.md) for detailed build instructions required by Mozilla.

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

MIT
