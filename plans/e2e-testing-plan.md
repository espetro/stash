# E2E Test Suite Implementation Plan - TabShare

## Overview
Create comprehensive E2E tests in Gauge format (.md files) to verify the TabShare browser extension and viewer functionality against the acceptance criteria.

## Test Coverage Goals

Verify these critical user journeys:
1. **Context Menu Appearance**: "Share selected tabs…" appears when tabs are selected
2. **Link Generation**: Extension generates and copies share link to clipboard
3. **Viewer Display**: Navigating to the link displays all shared tabs correctly

## Test Structure

Create 4 Gauge specification files in `tests/specs/`:

### 1. extension-context-menu.md
Tests context menu behavior and visibility:
- Context menu appears for single selected tab
- Context menu appears for multiple selected tabs
- Menu item click triggers extension
- Context menu NOT visible on page context (only tab context)

### 2. extension-link-generation.md
Tests share link generation and encoding:
- Generate link for single tab
- Generate link for multiple tabs (3-5 tabs)
- Long title truncation (30 char limit)
- URL budget truncation (8000 char limit with 100 tabs)
- Filter tabs without URLs (chrome:// pages)
- Preserve special characters and Unicode in URLs/titles
- Valid base64url encoding in clipboard

### 3. viewer-rendering.md
Tests viewer page display and interactions:
- Display single tab with favicon, title, domain
- Display multiple tabs (3+ items)
- "Open All Tabs" button functionality
- "Copy URLs" button functionality
- Individual tab click opens in new tab
- Expired link shows error message
- Invalid payload shows error
- Missing fragment shows error
- Invalid fragment format shows error
- Unsupported payload version shows error
- Favicon fallback on load error

### 4. end-to-end-integration.md
Complete user journeys:
- **Happy path**: Share single tab → view in browser
- **Happy path**: Share 5 tabs → view → copy URLs
- Link expiry validation (24 hours)
- Round-trip encoding preserves data (special chars, Unicode)
- Large tab set triggers truncation (150 tabs)
- Empty selection shows error

## Test Data Fixtures

Create `tests/fixtures/` directory with:

**sample-tabs.json** - Predefined tab datasets
```json
{
  "small": [{"url": "https://github.com", "title": "GitHub"}],
  "medium": [5 diverse tabs],
  "special-chars": [URLs with &, #, Unicode],
  "long-title": [title > 30 chars]
}
```

**payloads.json** - Pre-encoded test payloads
```json
{
  "valid-single": {v: 1, e: future, i: [...]},
  "expired": {v: 1, e: past, i: [...]},
  "invalid-version": {v: 999, ...}
}
```

## Implementation Approach

### Technology Stack
- **Gauge Framework**: Test specification and execution
- **Playwright**: Browser automation with extension support
- **TypeScript**: Step implementation language
- **Language**: JavaScript for Gauge runner

### Project Structure
```
tests/
├── specs/                          # Gauge .md specifications
│   ├── extension-context-menu.md
│   ├── extension-link-generation.md
│   ├── viewer-rendering.md
│   └── end-to-end-integration.md
├── step_implementations/           # TypeScript step definitions
│   ├── extension-steps.ts          # Extension interaction steps
│   ├── viewer-steps.ts             # Viewer page steps
│   ├── clipboard-steps.ts          # Clipboard operations
│   └── common-steps.ts             # Shared utilities
├── fixtures/                       # Test data
│   ├── sample-tabs.json
│   └── payloads.json
├── helpers/                        # Test utilities
│   ├── browser-helper.ts           # Browser setup/teardown
│   ├── encoder-helper.ts           # Encoding utilities
│   └── decoder-helper.ts           # Decoding utilities
├── env/
│   └── default/
│       └── gauge.properties        # Test configuration
└── package.json                    # Test dependencies
```

### Step Implementation Strategy

**Extension Steps** (extension-steps.ts):
- Launch browser with extension loaded using Playwright
- Navigate to URLs in new tabs
- Simulate multi-tab selection (Cmd/Ctrl+Click)
- Trigger context menu on tabs
- Verify context menu items
- Click menu items
- Read notifications

**Viewer Steps** (viewer-steps.ts):
- Navigate to viewer URLs with encoded payloads
- Create payloads from table data
- Verify page elements (item count, tab list, buttons)
- Click buttons and verify interactions
- Mock time for expiry testing
- Verify error states

**Clipboard Steps** (clipboard-steps.ts):
- Read clipboard content
- Verify URL format and structure
- Decode URL fragments
- Store decoded payloads for assertions
- Verify base64url encoding validity

**Common Steps** (common-steps.ts):
- Wait for elements
- Assert text content
- Count elements
- Handle async operations

### Key Implementation Details

**Browser Extension Loading (Playwright)**:
```typescript
const browser = await chromium.launchPersistentContext("", {
  args: [
    `--disable-extensions-except=./extension/.output/chrome-mv3`,
    `--load-extension=./extension/.output/chrome-mv3`
  ]
});
```

**Payload Generation from Tables**:
```typescript
step("Navigate to viewer with payload <table>", async (table) => {
  const items = table.getTableRows().map(row => [
    row.getCell("url"),
    row.getCell("title")
  ]);
  const payload = {v: 1, e: futureTimestamp(), i: items};
  const encoded = encodePayload(payload); // Use actual encoder
  await page.goto(`http://localhost:4321/s/#p=${encoded}`);
});
```

**Time Mocking for Expiry**:
```typescript
await page.addInitScript(() => {
  const now = Date.now();
  Date.now = () => now + (25 * 60 * 60 * 1000); // +25 hours
});
```

## Critical Files Reference

Implementation must validate against:
- `extension/entrypoints/background.ts:6-62` - Context menu setup and click handler
- `extension/lib/encoder.ts:115-158` - encodeTabsToShareUrl() main entry point
- `extension/lib/encoder.ts:71-110` - findMaxTabsWithinBudget() binary search
- `extension/lib/encoder.ts:15-20` - normalizeTitle() 30 char truncation
- `extension/lib/constants.ts` - BUDGET_CHARS (8000), EXPIRY_HOURS (24), MAX_TITLE_CHARS (30)
- `viewer/src/lib/decoder.ts:29-119` - decodeShareUrl() with validation
- `viewer/src/pages/s.astro:207-288` - init() and showContent() viewer logic

## Configuration

**gauge.properties**:
```properties
BROWSER = chrome
HEADLESS = false
EXTENSION_PATH = ./extension/.output/chrome-mv3
VIEWER_URL = http://localhost:4321
STEP_TIMEOUT = 30000
```

**package.json** (tests/):
```json
{
  "scripts": {
    "test": "gauge run",
    "test:spec": "gauge run specs/",
    "test:parallel": "gauge run --parallel -n 2"
  },
  "dependencies": {
    "@getgauge/cli": "^1.6.0",
    "playwright": "^1.40.0",
    "pako": "^2.1.0"
  }
}
```

## Test Execution Prerequisites

1. **Build extension**: `npm run build --workspace=extension`
2. **Start viewer server**: `npm run dev --workspace=viewer` (runs on localhost:4321)
3. **Install Gauge**: `npm install -g @getgauge/cli`
4. **Initialize test project**: `gauge init ts` in tests/
5. **Install dependencies**: `npm install` in tests/

## Verification Steps

After implementation, verify tests work by:

1. **Smoke test**: Run single spec manually
   ```bash
   gauge run tests/specs/extension-context-menu.md
   ```

2. **Full suite**: Run all specs
   ```bash
   gauge run tests/specs/
   ```

3. **Check coverage**:
   - All 3 acceptance criteria have passing scenarios
   - Context menu appearance: ✓ extension-context-menu.md
   - Link generation: ✓ extension-link-generation.md + end-to-end-integration.md
   - Viewer display: ✓ viewer-rendering.md + end-to-end-integration.md

4. **Edge cases verified**:
   - [ ] URL budget truncation with 100+ tabs
   - [ ] Expired link error (24+ hours)
   - [ ] Invalid payload error handling
   - [ ] Special character preservation
   - [ ] Unicode handling

5. **Manual verification**:
   - Run extension in browser, follow test scenarios manually
   - Verify viewer displays match test expectations
   - Check notifications appear correctly

## Success Criteria

Tests are complete when:
- ✅ All 4 .md specification files created in Gauge format
- ✅ All critical scenarios have passing Gauge steps
- ✅ Extension context menu behavior validated
- ✅ Link generation and clipboard copy validated
- ✅ Viewer rendering and interactions validated
- ✅ Round-trip encoding/decoding validated
- ✅ Edge cases covered (expiry, truncation, errors)
- ✅ Tests can run via `gauge run` command
- ✅ All 3 user acceptance criteria verified by passing tests
