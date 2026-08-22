# apps/viewer

Astro static site: renders shared tab payloads, hosts the Starlight docs
under `/docs`, serves agent JSON endpoints (`/json`, `/md`, `/s`,
`/api/openapi.json`, `/llms.txt`), and the `/stashes` local library page.

User-facing screens are mapped in `.agents/docs/screens/` (see
`screen-viewer-*.md` and `screen-docs-1.md`); update them when page or
dialog UI changes.

## Formatting

oxfmt does not support `.astro` files. The combined format command is:

```bash
oxfmt --write 'src/**/*.{ts,tsx}' && prettier --write 'src/**/*.astro'
```

## Icons

`react-icons` FontAwesome 6 only (`react-icons/fa6`).

## Build-time env vars

`VITE_VIEWER_ORIGIN`, `VITE_SHORTENER_ORIGIN`,
`VITE_CHROME_DOWNLOAD_URL`, `VITE_FIREFOX_DOWNLOAD_URL`, and optional
`VITE_PUBLIC_POSTHOG_HOST` / `VITE_PUBLIC_POSTHOG_KEY` (omit the PostHog
pair to disable telemetry). Docs sidebar is configured in
`astro.config.mjs`; end-user docs live in `content/docs/`.

## Tests

```bash
pnpm --filter stash-viewer run test
```
