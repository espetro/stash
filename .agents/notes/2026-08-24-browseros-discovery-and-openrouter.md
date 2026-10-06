# BrowserOS auto-discovery, headless mode, and reproducible OpenRouter config

## Auto-discovery, not hardcoded paths

`packages/e2e/helpers/browser-helper.ts`'s `locateMacApp()` resolves a
`.app` bundle by checking `~/Applications` then `/Applications` for
`<bundleName>.app/Contents/MacOS/<executableName>`. `BROWSER_LABEL=chrome`
or `BROWSER_LABEL=browseros` triggers discovery; `BROWSER_EXECUTABLE_PATH`
always wins if set. Verified on this machine: Chrome resolves under
`/Applications`, BrowserOS resolves under `~/Applications` — the two
standard install locations differ per app/user, which is exactly why
discovery (not a fixed path) is needed for portability across machines.

## Headless BrowserOS works, with one gotcha

`BrowserOS --headless=new --user-data-dir=<dir> about:blank` starts
cleanly and its internal agent bridge ("BrowserOS Server" — a
Consolidated HTTP Server plus its own CDP hookup) connects fine. Do
**not** pass `--remote-debugging-port` explicitly on the command line —
BrowserOS's internal agent server has its own fixed default CDP port
(9100) baked in and fails ("Failed to start CDP") if that port is
externally overridden. Playwright doesn't set this flag on its own launch
path, so this only bites if BrowserOS is driven by hand outside
Playwright.

## Reproducible AI-provider config

BrowserOS's built-in agent reads its LLM provider config from a
`browseros.providers` string (itself JSON) inside the launch profile's
Chromium `Preferences` file
(`~/Library/Application Support/BrowserOS/<Profile N>/Preferences` for a
normal personal install). Chromium preserves an existing `Preferences`
file on first launch instead of overwriting it, so pre-seeding a *fresh*
`userDataDir`'s `Default/Preferences` before launch is sufficient to pin
the provider — no need to touch or parse the developer's real profile.

`packages/e2e/helpers/browseros-profile.ts` implements this: creates a
temp `userDataDir`, writes a single `openai-compatible` provider entry
pointed at `https://openrouter.ai/api/v1` using `OPENROUTER_API_KEY` /
`OPENROUTER_MODEL_ID` from the root `.env`. Wired into
`launchWithExtension()` behind `BROWSEROS_OPENROUTER=1` (opt-in, default
behavior unchanged) — see `pnpm test:browseros:openrouter` in
`packages/e2e/package.json`. The seeded dir is temp-only, cleaned up in
`closeContext()` and swept again on process exit.

**Never seed into or read from the developer's real BrowserOS profile.**
Real personal profiles observed on this machine had live plaintext
third-party API keys (not OpenRouter) stored in the same
`browseros.providers` structure — a reminder that this file is sensitive
and must never be copied/committed as a fixture.
