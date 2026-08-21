---
"stash-viewer": minor
---

Locale-prefixed landing URLs (`/es`, `/fr`, `/ru`) with full i18n coverage of every landing section. Adds `<html lang>`, hreflang alternates, canonical tags, and `@astrojs/sitemap` integration. The `intl-ai` config now loads `.env` automatically via Node's built-in `loadEnvFile`, so `pnpm run i18n:fill` works without sourcing env vars manually.
