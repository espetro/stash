# TabShare E2E Test Suite

Comprehensive end-to-end tests for the TabShare browser extension and viewer application using Gauge and Playwright.

## Prerequisites

1. **Node.js**: v18.0.0 or higher
2. **npm**: v9.0.0 or higher
3. **Gauge CLI**: Install globally with `npm install -g @getgauge/cli`

## Setup

### 1. Build the Extension

```bash
# From the project root
npm run build --workspace=extension
```

This will build the extension to `extension/.output/chrome-mv3`.

### 2. Start the Viewer Server

```bash
# From the project root
npm run dev --workspace=viewer
```

The viewer will be available at `http://localhost:4321`.

### 3. Install Test Dependencies

```bash
cd tests
npm install
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Specification Files

```bash
# Context menu tests
npm run test:context-menu

# Link generation tests
npm run test:link-generation

# Viewer rendering tests
npm run test:viewer

# End-to-end integration tests
npm run test:e2e
```

### Run Tests in Parallel

```bash
npm run test:parallel
```

### Generate Documentation

```bash
npm run docs
```

### Validate Specifications

```bash
npm run validate
```

## Test Structure

```
tests/
├── specs/                          # Gauge specification files (.md)
│   ├── extension-context-menu.md    # Context menu behavior tests
│   ├── extension-link-generation.md # Link generation tests
│   ├── viewer-rendering.md          # Viewer display tests
│   └── end-to-end-integration.md   # Complete user journey tests
├── step_implementations/           # TypeScript step implementations
│   ├── common-steps.ts            # Shared utility steps
│   ├── extension-steps.ts          # Extension interaction steps
│   ├── viewer-steps.ts             # Viewer page steps
│   └── clipboard-steps.ts          # Clipboard operation steps
├── helpers/                        # Test utilities
│   ├── browser-helper.ts           # Browser setup/teardown
│   ├── encoder-helper.ts           # Encoding utilities
│   └── decoder-helper.ts           # Decoding utilities
├── fixtures/                       # Test data
│   ├── sample-tabs.json           # Predefined tab datasets
│   └── payloads.json              # Pre-encoded test payloads
├── env/
│   └── default/
│       └── gauge.properties        # Gauge configuration
├── package.json                    # Test dependencies
└── tsconfig.json                  # TypeScript configuration
```

## Test Coverage

### 1. Extension Context Menu (`extension-context-menu.md`)
- Context menu appears for single selected tab
- Context menu appears for multiple selected tabs
- Menu item click triggers extension
- Context menu NOT visible on page context

### 2. Extension Link Generation (`extension-link-generation.md`)
- Generate link for single tab
- Generate link for multiple tabs (3-5 tabs)
- Long title truncation (30 char limit)
- URL budget truncation (8000 char limit with 100 tabs)
- Filter tabs without URLs (chrome:// pages)
- Preserve special characters and Unicode in URLs/titles
- Valid base64url encoding in clipboard

### 3. Viewer Rendering (`viewer-rendering.md`)
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

### 4. End-to-End Integration (`end-to-end-integration.md`)
- Happy path: Share single tab → view in browser
- Happy path: Share 5 tabs → view → copy URLs
- Link expiry validation (24 hours)
- Round-trip encoding preserves data (special chars, Unicode)
- Large tab set triggers truncation (150 tabs)
- Empty selection shows error

## Configuration

### Environment Variables

Set these in `tests/env/default/gauge.properties`:

```properties
BROWSER = chrome                    # Browser to use
HEADLESS = false                   # Run tests in headless mode
EXTENSION_PATH = ./extension/.output/chrome-mv3  # Extension build path
VIEWER_URL = http://localhost:4321               # Viewer server URL
STEP_TIMEOUT = 30000               # Step timeout in milliseconds
```

### Override Environment Variables

```bash
# Run tests in headless mode
HEADLESS=true npm test

# Use a different extension path
EXTENSION_PATH=./custom/path npm test
```

## Troubleshooting

### Extension Not Found

```
Error: Extension not found at ./extension/.output/chrome-mv3
```

**Solution**: Build the extension first:
```bash
npm run build --workspace=extension
```

### Viewer Server Not Running

```
Error: Cannot connect to http://localhost:4321
```

**Solution**: Start the viewer server:
```bash
npm run dev --workspace=viewer
```

### Gauge Not Installed

```
Error: gauge: command not found
```

**Solution**: Install Gauge globally:
```bash
npm install -g @getgauge/cli
```

### Playwright Browsers Not Installed

```
Error: Executable doesn't exist at /path/to/chrome
```

**Solution**: Install Playwright browsers:
```bash
npx playwright install chromium
```

## Writing New Tests

### 1. Create a Specification File

Create a new `.md` file in `tests/specs/`:

```markdown
# My New Test

## Scenario: Test something new
Given the browser is launched
When the user does something
Then something should happen
```

### 2. Implement Steps

Add step implementations in `tests/step_implementations/`:

```typescript
import { step } from '@getgauge/cli';

step('The user does something', async () => {
  // Implementation here
});

step('Something should happen', async () => {
  // Implementation here
});
```

### 3. Run Tests

```bash
npm test
```

## Success Criteria

The E2E test suite is complete when:
- ✅ All 4 .md specification files created in Gauge format
- ✅ All critical scenarios have passing Gauge steps
- ✅ Extension context menu behavior validated
- ✅ Link generation and clipboard copy validated
- ✅ Viewer rendering and interactions validated
- ✅ Round-trip encoding/decoding validated
- ✅ Edge cases covered (expiry, truncation, errors)
- ✅ Tests can run via `gauge run` command
- ✅ All 3 user acceptance criteria verified by passing tests

## License

MIT
