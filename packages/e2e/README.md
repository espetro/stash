# Stash E2E Test Suite

End-to-end tests for the Stash browser extension and viewer, written in
Playwright with markdown-style scenario specs. No external test runner
(Gauge, Selenium, etc.) — just `pnpm exec playwright test` driven by
`specs.spec.ts` which dynamically loads each `specs/*.spec` file.

## Prerequisites

1. **Node.js**: v20+ (matches `.github/workflows/ci.yml`)
2. **pnpm**: v11 (matches the workspace root)
3. **Playwright browser**: `npx playwright install chromium`

The viewer build is managed automatically by Playwright's `webServer`
config (`packages/e2e/playwright.config.ts`), so you do **not** need
to start `astro dev` manually. The webServer runs:

```
pnpm --filter stash-viewer exec astro build && astro preview --port 4321
```

…from the workspace root, so the share URLs the encoder produces
(`http://localhost:4321/s/#p=…`) hit a real production build with no
Astro dev toolbar overlay (which would otherwise inject stray anchor
elements that the spec assertions would pick up).

## Setup

```bash
# From the workspace root
pnpm install
pnpm --filter @stash/e2e exec playwright install chromium
```

## Running Tests

### All tests

```bash
pnpm --filter @stash/e2e exec playwright test
```

By default Playwright uses one worker, which keeps Chromium memory
under 1.5 GB on 8 GB laptops. To force a different worker count:

```bash
pnpm --filter @stash/e2e exec playwright test --workers=2
```

### Subsets

```bash
# All viewer-rendering scenarios
pnpm --filter @stash/e2e exec playwright test --grep "Viewer Rendering"

# Single scenario
pnpm --filter @stash/e2e exec playwright test --grep "Happy path - Share single tab"
```

### Dry-run validator (no browser)

```bash
pnpm --filter @stash/e2e run validate:steps
```

This parses every `specs/*.spec` file and verifies each step
text matches a registered handler. Runs in well under a second,
no Chromium required, and is fast enough to wire into a pre-push
hook. Exits non-zero on:

- unresolved step text (typo or missing handler)
- ambiguous registration (two handlers match the same step text)

### Fixture freshness

`fixtures/payloads.json` and `fixtures/sample-tabs.json` are checked
into the repo. They are regenerated automatically by Playwright's
`globalSetup` when the codec sources are newer than the committed
fixtures — see `lib/regenerate-fixtures.ts`. Manual regeneration:

```bash
pnpm --filter @stash/e2e exec tsx fixtures/generate.ts
```

The generator round-trips every fixture through the codec and exits
non-zero on any mismatch, so a stale fixture set can never ship
silently.

## Test Structure

```
packages/e2e/
├── playwright.config.ts             # webServer + globalSetup
├── global-setup.ts                  # mtime check + fixture regen
├── specs.spec.ts                    # one test() per scenario
├── register-steps.ts                # side-effect import of every handler
├── specs/                           # .spec files (markdown-style)
│   ├── viewer-rendering.spec
│   ├── extension-link-generation.spec
│   └── end-to-end-integration.spec
├── step_implementations/            # step() handlers
│   ├── common-steps.ts
│   ├── codec-steps.ts               # codec-only scenarios
│   ├── extension-steps.ts
│   ├── viewer-steps.ts
│   ├── clipboard-steps.ts
│   ├── popup-steps.ts
│   └── settings-steps.ts
├── lib/
│   ├── step-registry.ts             # token compile + longest-literal match
│   ├── spec-loader.ts               # parse .spec files → scenarios
│   ├── dry-run.ts                   # validate:steps entry point
│   ├── fixtures.ts                  # Playwright `state` fixture
│   ├── scenario-state.ts            # per-scenario state holder
│   └── regenerate-fixtures.ts       # mtime check
├── helpers/
│   ├── browser-helper.ts            # shared chromium singleton
│   ├── encoder-helper.ts
│   └── decoder-helper.ts
├── fixtures/
│   ├── payloads.json                # committed pre-encoded payloads
│   ├── sample-tabs.json
│   └── generate.ts                  # regenerator with round-trip check
└── package.json
```

## Adding a New Step

1. Add a `step("Your step text with <param>", async (param) => { ... })`
   call in the most appropriate file under `step_implementations/`.
2. Run `pnpm --filter @stash/e2e run validate:steps` to confirm the
   step text compiles and isn't ambiguous with another handler.
3. Reference it from a `.spec` file as `* Your step text with "value"`.

Parameter placeholders:

- `<name>` — matches any non-whitespace chunk and captures it
- `"text"` — matches a quoted literal exactly (tighter than `<name>`)
- For disambiguating identical-looking button steps, prefer the
  quoted form so each handler's compiled regex has a unique literal
  prefix.

## Coverage

### Viewer Rendering (`specs/viewer-rendering.spec`)
- Single tab renders favicon + title + domain
- Multiple tabs render in order
- "Open selected" button flow
- Share-as-QR / New buttons visible
- Expired, invalid, unsupported-version, empty payload errors
- Truncated title display (max 120 chars)
- Responsive layout on mobile viewport

### Extension Link Generation (`specs/extension-link-generation.spec`)
- Single-tab share link
- Long-title truncation
- URL-budget truncation (codec-only, in-process)
- `chrome://` page filtering
- Special-character and Unicode preservation
- Base64url-only encoding
- `#p=` fragment marker

### End-to-End Integration (`specs/end-to-end-integration.spec`)
- Happy path: share single tab → view in browser
- 5-tab round-trip → view
- Special chars + Unicode round-trip
- URL-budget truncation (codec-level)
- Empty selection, chrome:// filtering
- Link expiry, version, base64url fragment marker

## Configuration

### Environment Variables

| Name              | Default                   | Purpose                                        |
| ----------------- | ------------------------- | ---------------------------------------------- |
| `VIEWER_ORIGIN`   | `http://localhost:4321`   | Origin share URLs point to (matches webServer) |
| `HEADLESS`        | `true`                    | Set `false` to watch scenarios run             |

### Playwright Config

See `playwright.config.ts`. Key choices:

- `webServer` builds and previews the viewer in one shot — no separate
  terminal needed.
- `globalSetup` regenerates stale fixtures before the suite runs.
- `workers: 1` keeps memory predictable on CI runners and 8 GB laptops.
- `reporter: "line"` in CI; use `--reporter=list` locally for detail.
