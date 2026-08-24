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

Note: some machines (including the one this suite was developed on)
lack the Playwright browser binaries at `~/.cache/ms-playwright`. The
`playwright install chromium` line above is a one-time fix; without it
every test fails at browser launch.

## Verify with sample data (agent path)

The whole app can be verified against committed sample data with one
command chain, no manual setup:

```bash
pnpm --filter @stash/extension run build \
  && pnpm --filter stash-viewer run build \
  && pnpm --filter @stash/e2e run test
```

Ground truth lives in `packages/shared/fixtures/payloads.json`
(canonical; mirrored into `packages/e2e/fixtures/` by the generator)
and `packages/shared/fixtures/sample-tabs.json`. Each payload entry
carries the encoded fragment plus the expected decoded `items`, so
failures name the exact mismatch. The extension seed for MCP
scenarios is `EXTENSION_SEED` in `helpers/mcp-seed.ts`, derived from
the same sample-tabs datasets.

The extension build is only needed for the `agent-flow-extension`
spec (it drives the built MV3 background service worker); the viewer
build is handled automatically by Playwright's `webServer` config.

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
│   ├── agent-flow.spec
│   ├── agent-flow-extension.spec
│   └── end-to-end-integration.spec
├── step_implementations/            # step() handlers
│   ├── common-steps.ts
│   ├── codec-steps.ts               # codec-only scenarios
│   ├── extension-steps.ts
│   ├── viewer-steps.ts
│   ├── clipboard-steps.ts
│   ├── popup-steps.ts
│   ├── agent-flow-steps.ts          # fetch-only agent + extension MCP
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
│   ├── decoder-helper.ts
│   ├── mcp-seed.ts                  # extension MCP JSON-RPC client + seed
│   └── agent-fetch-server.ts        # local /s?p= stand-in (Pages Functions)
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

### Agent Flow (`specs/agent-flow.spec`)
- JSON alternate link (`<link rel="alternate" type="application/json">`)
  discovered from served HTML, fetched, item count + known URL/title
- Markdown alternate link round-trip
- `Accept: text/plain` and `Accept: text/markdown` negotiation
- Fixture-driven (three-tabs, five-tabs, single-tab)

### Agent Flow Extension (`specs/agent-flow-extension.spec`)
- MCP `initialize` + `tools/list` over the extension runtime port
  (spoken from the options page, the same surface MCP-B uses)
- Full 8-tool list asserted
- `stash_snapshot_tabs` shape check
- Canonical seed via `stash_create`, then `stash_list` /
  `stash_get` / `stash_search` round-trip
- Requires a built extension (`pnpm --filter @stash/extension run build`)

#### Why the agent surface needs a local server

`astro preview` serves the static build only; the Cloudflare Pages
Function implementing `GET /s?p=&format=` (and Accept negotiation)
does not execute locally. `helpers/agent-fetch-server.ts` imports the
real `onRequest` handler from `apps/viewer/functions/s.ts` and serves
it over a loopback HTTP server, with `context.next()` proxied to the
preview server. A small wasm loader hook (registered from
`specs.spec.ts` via `PLAYWRIGHT_FORCE_ASYNC_LOADER`) lets Node import
the vendored brotli `.wasm` the handler needs.

## Configuration

### Environment Variables

| Name              | Default                   | Purpose                                        |
| ----------------- | ------------------------- | ---------------------------------------------- |
| `VIEWER_ORIGIN`   | `http://localhost:4321`   | Origin share URLs point to (matches webServer) |
| `HEADLESS`        | `true`                    | Set `false` to watch scenarios run             |
| `BROWSER_EXECUTABLE_PATH` | unset              | Absolute path to an alternative Chromium-based browser binary. Wins over `BROWSER_LABEL` auto-discovery when set. |
| `BROWSER_LABEL`   | `chromium` (or `custom` if `BROWSER_EXECUTABLE_PATH` is set) | Selects a known browser to auto-discover: `chrome` or `browseros`. Used by `pnpm test:chrome` / `pnpm test:browseros`. |

**Browser auto-discovery (macOS):** setting `BROWSER_LABEL=chrome` or `BROWSER_LABEL=browseros` looks up that app's bundle under `~/Applications` first, then `/Applications` — no hardcoded path required, so this works unmodified on any macOS device with the app installed in either location. See `locateMacApp()` in `helpers/browser-helper.ts`. Set `BROWSER_EXECUTABLE_PATH` explicitly to override discovery or to test on non-macOS platforms.

**BrowserOS headless support:** confirmed working. `BrowserOS --headless=new --user-data-dir=<dir> about:blank` starts cleanly, its internal "BrowserOS Server" (the agent bridge — Consolidated HTTP Server + CDP hookup) connects successfully, and Playwright can drive it exactly like stock Chromium. One caveat found during testing: don't pass an explicit `--remote-debugging-port` on BrowserOS's command line — its internal agent server assumes a fixed default CDP port (9100) and fails to start ("Failed to start CDP") if that port is overridden externally. Playwright's own launch path doesn't set this flag, so `test:browseros`/`test:chrome` are unaffected; only relevant if you're driving BrowserOS by hand outside Playwright.

**Reproducible BrowserOS AI-provider config (OpenRouter):** BrowserOS's built-in agent reads its provider config from a `browseros.providers` key in the launch profile's Chromium `Preferences` file. Rather than depending on whatever provider a developer has configured in their personal BrowserOS profile (not reproducible across machines/CI, and risks touching real personal API keys), `pnpm test:browseros:openrouter` seeds a **fresh, isolated, temp `userDataDir`** per run — never the developer's real profile — with a single `openai-compatible` provider pointed at OpenRouter, using `OPENROUTER_API_KEY` / `OPENROUTER_MODEL_ID` from the root `.env` (same variables `packages/evals` already uses). See `helpers/browseros-profile.ts`. The seeded profile dir is removed after the context closes (`closeContext()`) and swept again on process exit as a safety net.

| Name                  | Default | Purpose                                                                 |
| --------------------- | ------- | ------------------------------------------------------------------------ |
| `BROWSEROS_OPENROUTER` | unset   | Set to `1` (only meaningful with `BROWSER_LABEL=browseros`) to seed an isolated OpenRouter-backed profile instead of using the developer's real BrowserOS profile |

**Port constraint:** `VIEWER_ORIGIN` only helps for host changes on port `4321`. The extension's local-bridge allowlist (`LOCAL_LIBRARY_VIEWER_ORIGINS` in `apps/extension/lib/settings.ts`) and the content-script `matches` pattern (`apps/extension/entrypoints/stashes-bridge.content.ts`) are both port-pinned to `4321` — only `https://stash.illo.fyi`, `http://localhost:4321`, and `http://127.0.0.1:4321` are allowed. Do not widen that allowlist for test convenience; running the local-bridge scenarios against a different port is out of scope.

### Playwright Config

See `playwright.config.ts`. Key choices:

- `webServer` builds and previews the viewer in one shot — no separate
  terminal needed.
- `globalSetup` regenerates stale fixtures before the suite runs.
- `workers: 1` keeps memory predictable on CI runners and 8 GB laptops.
- `reporter: "line"` in CI; use `--reporter=list` locally for detail.
