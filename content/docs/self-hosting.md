---
title: Self-Hosting
description: Run your own Stash viewer, short link service, or go fully local with no infrastructure at all.
---

Stash is designed so you can run as much or as little of it yourself. There are three setups, from zero infrastructure to a full stack.

## Fully local (no infrastructure)

This is the default mode and requires nothing to deploy.

Tab data is compressed and encoded directly into the share URL. Share links like `https://your-viewer.example.com/?p=...` carry the whole payload, so the viewer just decodes what is already in the URL. Saved stashes live in your browser's `storage.local` via the extension's stash library, and AI agents talk to the extension over a local MCP connection. No server ever sees your tabs.

To point the extension at your own viewer, self-host the viewer (below) and set the viewer origin when building the extension with the `VITE_VIEWER_ORIGIN` environment variable.

## Viewer on Cloudflare Pages

The viewer (`apps/viewer`) is an Astro static site.

1. Fork or push this repository to your own GitHub account.
2. In the Cloudflare dashboard, create a Pages project connected to the repo. Set the build command and output directory to match `apps/viewer/package.json` (build: `pnpm --filter stash-viewer run build`, output: `apps/viewer/dist`).
3. Configure build environment variables:

| Variable | Purpose |
|----------|---------|
| `VITE_VIEWER_ORIGIN` | Public origin of the viewer, e.g. `https://stash.example.com` |
| `VITE_SHORTENER_ORIGIN` | Origin of your shortener worker, if you run one. Omit to disable short links |
| `VITE_CHROME_DOWNLOAD_URL` | Chrome Web Store (or own-hosted) download link |
| `VITE_FIREFOX_DOWNLOAD_URL` | Firefox Add-ons download link |
| `VITE_PUBLIC_POSTHOG_HOST` | PostHog host, if you use PostHog. Omit to disable telemetry |
| `VITE_PUBLIC_POSTHOG_KEY` | PostHog project API key |

Omitting the PostHog variables disables analytics entirely; the viewer then makes no outbound telemetry requests.

## Shortener on Cloudflare Workers + KV

The shortener (`apps/shortener`) is a Cloudflare Worker that provides opt-in short links (`/s/<id>`) and the hosted MCP endpoint (`/mcp`). It needs a KV namespace and a couple of bindings configured in `apps/shortener/wrangler.toml`:

1. `wrangler kv namespace create STASH_KV` and paste the returned `id` (and `preview_id`) into the `[[kv_namespaces]]` block.
2. The Workers rate limit bindings `RL_STASH` (5 requests per minute per IP for `POST /api/stash`) and `RL_MCP` (60 per minute for `POST /mcp`) are already defined under `[[ratelimits]]`.
3. The `STASH_ANALYTICS` Analytics Engine binding (optional) records anonymous aggregate counters. Remove the block to disable telemetry.
4. Deploy with `pnpm --filter @stash/shortener exec wrangler deploy`, authenticating via the `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` environment variables (this is what the repo's `deploy.yml` workflow does).

### Zero-trust relay storage

Shortened stashes are zero-trust: before upload, the extension or viewer encrypts the payload with a random per-share AES-256-GCM key. Only the ciphertext (base64url) is stored in KV, alongside creation/expiry timestamps. The key travels exclusively in the URL fragment (`/s/<id>#<key>`), which browsers never send to servers, so your deployment cannot decrypt the stashes it stores.

Retention: KV entries are evicted by TTL (at most 7 days on the hosted relay, configurable via `maxTtl`) and can be revoked early with `DELETE /api/stash/:id`. There are no other copies and no backups.

Because stored payloads are unreadable without the fragment key, server-side plaintext rendering (markdown/txt negotiation) is unavailable for relayed entries: `GET /s/:id?format=md` and `?format=txt` fail closed with 409. `?format=json` returns the ciphertext envelope; the MCP `stash_get` tool returns an `encrypted` error for relayed entries and works only for self-contained payloads.

Share links that use the full `#p=` payload never touch the shortener.

## Pointing the pieces at each other

- Extension builds accept `VITE_VIEWER_ORIGIN` so generated links use your viewer.
- Viewer builds accept `VITE_SHORTENER_ORIGIN` so the opt-in short link feature calls your worker.
- See the [Agents & MCP](/agent-server) page for the MCP tools available on each surface.
