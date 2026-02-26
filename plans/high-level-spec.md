# Spec: “TabShare” — Snapshot tab-folder links (cross-browser extension)

## Short summary
TabShare is a cross-browser WebExtension that adds a **Share selected tabs…** option to the tab context menu. It creates a shareable “folder view” link containing a snapshot of the selected tabs (URL + short title), copies it to the clipboard, and opens a static viewer page that can render and open the shared set.

## Vision
Enable “Arc Share Folder”-style sharing for any browser that supports WebExtensions: Chrome, Edge, Firefox, Safari, and other Chromium-based browsers. The experience should feel native (context menu action on multi-selected tabs), be fast globally, and keep operational burden minimal by using a no-backend, URL-encoded payload design. [page:1]

## Core features

### 1) Multi-tab context menu share
- Add a tab context menu item: `Share selected tabs…`
- When multiple tabs are selected, this action applies to the selected set (as the browser’s multi-select model).
- Works across Chromium + Firefox; on Firefox, multi-selected tabs are represented as “highlighted tabs,” and selection changes can be observed through `tabs.onHighlighted`. [page:0]

### 2) Snapshot link generation (no backend)
- Generate a share URL of the form:
  - `https://<viewer-origin>/s/#p=<payload>`
- Payload is encoded in the URL fragment so it is not sent to the server by default (privacy + caching friendliness).
- Payload contains only:
  - `url`: full URL
  - `t`: short title (max 20–30 chars)
  - `e`: expiry timestamp (now + 24h)
  - `v`: schema version
- Enforce a deterministic URL budget (see “Budget enforcement”).

### 3) Clipboard + optional open
- Copy generated share link to clipboard.
- Optionally open the viewer page in a new tab (configurable).

### 4) Viewer page (“folder view”)
- Static site (SSG) built with Astro.
- Reads payload from `location.hash`, decodes it client-side, validates schema + expiry, and renders:
  - List of links with short titles and domains
  - “Open all” action (user-initiated)
  - Export actions: Copy URLs; Download as bookmarks HTML (optional)

### 5) Expiry behavior (24h)
- “Deleted by default after 24h” is implemented as **client-side expiry**:
  - Viewer refuses to display/open items after `e` (expiration time).
- Note: because the data is in the URL, this is not server-side deletion; anyone with the URL still has the encoded data.

## Tech stack

### Extension
- Framework: WXT (MIT-licensed), producing WebExtensions for Chrome, Firefox, Edge, Safari, and Chromium-based browsers. [page:1]
- Language: TypeScript
- APIs:
  - `contextMenus` to add the right-click item
  - `tabs` to read selected/highlighted tabs and their URLs/titles
  - On Firefox: `tabs.onHighlighted` to track highlighted (multi-selected) tab IDs. [page:0]
  - `clipboardWrite` (or `navigator.clipboard.writeText` from a user gesture) to copy the link
- Encoding libs (implementation choice):
  - TextEncoder + JSON
  - Compression (gzip/deflate) if needed
  - base64url encoding

### Viewer (Astro SSG)
- Astro site deployed as static output
- Client-side decoding/rendering (minimal JS)
- Hosting: static CDN host (e.g., Cloudflare Pages / similar)

## Architecture

### Components
1. **Extension background/service worker**
   - Creates the context menu entry on install/startup.
   - Handles context menu click event.
   - Gathers selected tabs, builds payload, enforces URL budget, writes to clipboard.

2. **Optional extension UI**
   - Minimal “Share” confirmation (optional): shows count, estimated size, and lets user name the folder.
   - If included: either a small popup or a lightweight in-page dialog.

3. **Astro Viewer Site**
   - Route `/s/` is a static page.
   - Reads `#p=...` fragment, decodes payload, checks expiration, renders list.
   - Provides actions: open all, open individually, copy/export.

### Data flow
1. User multi-selects tabs.
2. User right-clicks a selected tab → chooses **Share selected tabs…**
3. Extension:
   - Reads selected/highlighted tabs
   - Maps to `[{url, titleShort}]`
   - Generates payload `{v, e, i:[ [url, titleShort], ... ]}`
   - Encodes to `#p=...`
   - Ensures final URL <= `BUDGET_CHARS`
   - Copies link to clipboard
4. Recipient opens link:
   - CDN serves `/s/` instantly (static)
   - Viewer decodes `#p=...` locally and renders

### URL payload format (v1)
- JSON (no whitespace), keys kept short:
  - `v`: number (schema version)
  - `e`: number (Unix seconds expiry)
  - `i`: array of items, each item is a 2-tuple: `[url, t]`
- Encode:
  1. UTF-8 bytes of JSON
  2. (Optional) compress
  3. base64url
  4. place in fragment: `#p=<b64url>`

### Budget enforcement (deterministic)
- Define constants:
  - `BUDGET_CHARS` (e.g., 8000)
  - `MAX_TITLE_CHARS` (e.g., 30)
- Deterministic rules:
  - Normalize titles (trim, collapse whitespace, truncate to MAX_TITLE_CHARS).
  - Preserve tab order (or sort; choose one and keep it stable).
- Compute final URL length after encoding.
- If too long: binary search the maximum prefix of items that fits, then share that subset and notify the user.

## Non-goals (initial MVP)
- Live/shared updates (snapshot only).
- Sharing cookies/sessions/auth state (links only).
- True deletion (server-side revocation) under the no-backend model.

## Acceptance criteria (MVP)
- Works in Firefox + Chromium browsers via WXT builds. [page:1]
- Context menu item appears and produces a share link for multi-selected tabs.
- Link opens viewer and shows the correct list with titles (20–30 chars).
- Link expires in viewer behavior after 24 hours.
- URL budget is enforced deterministically (same input → same output; never generates an oversized link).
