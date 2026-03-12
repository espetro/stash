# Source Code Build Instructions

This document provides step-by-step instructions for building the Stash Firefox extension from source. Required for Mozilla Add-ons (AMO) source code submission.

## Build Requirements

| Requirement | Version |
|-------------|---------|
| Operating System | macOS, Linux, or Windows |
| Node.js | v18.0.0 or higher |
| pnpm | v10.0.0 or higher |

## Installing Build Tools

### Node.js

Install Node.js v18+ from https://nodejs.org/ or via nvm:

```bash
# Using nvm
nvm install 18
nvm use 18

# Verify installation
node --version  # Should show v18.x.x or higher
```

### pnpm

```bash
npm install -g pnpm@10

# Verify installation
pnpm --version  # Should show 10.x.x or higher
```

## Build Instructions

This extension uses a pnpm workspace. The project structure is:

```
stash/
├── package.json           # Root workspace config
├── pnpm-workspace.yaml    # Workspace definition
├── pnpm-lock.yaml         # Dependency lock file
├── apps/
│   ├── extension/         # Browser extension
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── wxt.config.ts
│   │   ├── entrypoints/
│   │   ├── lib/
│   │   └── public/
│   └── viewer/            # Astro viewer site
```

### Steps

1. **Navigate to the workspace root:**
    ```bash
    cd stash
    ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Build the Firefox extension:**
    ```bash
    cd apps/extension
    pnpm run build:firefox
    ```

4. **Verify the build:**
   The built extension will be in `.output/firefox-mv2/`

5. **(Optional) Create distributable zip:**
   ```bash
   pnpm run zip:firefox
   ```
    Output: `.output/stash-extension-{version}-firefox.zip`

## Creating Sources Zip for AMO

Mozilla requires a sources zip for extensions built with bundlers. To create it:

```bash
# From the workspace root (stash/)
./scripts/create-sources-zip.sh
```

Or manually:

```bash
# Create a temporary directory
mkdir -p /tmp/stash-sources

# Copy extension source files
cp -r apps/extension/entrypoints /tmp/tabshare-sources/
cp -r apps/extension/lib /tmp/tabshare-sources/
cp -r apps/extension/public /tmp/tabshare-sources/
cp apps/extension/package.json /tmp/tabshare-sources/
cp apps/extension/tsconfig.json /tmp/tabshare-sources/
cp apps/extension/wxt.config.ts /tmp/tabshare-sources/
cp apps/extension/SOURCES.md /tmp/tabshare-sources/README.md

# Copy workspace files
cp pnpm-workspace.yaml /tmp/tabshare-sources/
cp pnpm-lock.yaml /tmp/tabshare-sources/
cp package.json /tmp/tabshare-sources/root-package.json

# Create the zip
cd /tmp/stash-sources
zip -r stash-sources.zip .
mv stash-sources.zip ~/Downloads/
```

## Verification

To verify the build produces identical output:

1. Follow the build instructions above
2. Compare the contents of `.output/firefox-mv2/` with the submitted extension
3. The manifest.json, background.js, and popup files should match

## Project Structure

```
extension/
├── entrypoints/
│   ├── background.ts           # Service worker (context menu handler)
│   └── popup/                  # Popup UI (React)
│       ├── App.tsx             # Main React component
│       ├── main.tsx            # React entry point
│       ├── index.html          # HTML template
│       ├── style.css           # Popup styles
│       ├── types.ts            # TypeScript interfaces
│       ├── components/         # React components
│       │   ├── ErrorMessage.tsx
│       │   ├── LinkResult.tsx
│       │   ├── SelectAllToggle.tsx
│       │   ├── TabItem.tsx
│       │   └── TabList.tsx
│       └── hooks/              # React hooks
│           └── useTabSelection.ts
├── lib/
│   ├── constants.ts            # Configuration constants
│   ├── encoder.ts              # URL encoding/compression logic
│   └── types.ts                # Shared TypeScript interfaces
├── public/                     # Static assets
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── wxt.config.ts               # WXT build configuration
├── tsconfig.json               # TypeScript configuration
├── package.json                # Dependencies and scripts
└── SOURCES.md                  # This file
```
