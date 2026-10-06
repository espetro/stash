# PR A — product bug fixes + zero-touch E2E harness (2026-10-04)

Source: `.agents` assessment of develop @ c083f5a (hands-off E2E run). State-model work (Option A, "share = save") and the
header/layout redesign are separate follow-ups (PR B, PR C) and are out of scope here.

## Fixes

| ID | Bug | Change |
|---|---|---|
| B1 | `GET /s/:id` (HTML) on the relay 302s to `${relayOrigin}/s#p=…`, which 404s (relay doesn't serve the viewer) | `StashServerConfig.viewerOrigin?: string` → `StashServerDeps.viewerOrigin` (defaults to `origin`, so mirror/evals that serve the viewer keep working). Redirect target: `?v=` override → `${viewerOrigin}/s`. Shortener passes `env.VIEWER_ORIGIN ?? "https://stash.illo.fyi"`; `[vars] VIEWER_ORIGIN` in `wrangler.toml`. |
| B2 | `_middleware.ts` returns 404 for **every** `/.well-known/*`, including real files in `public/.well-known/` | Call `next()` first; pass through non-HTML OK responses; only replace the SPA HTML fallback / 404 with the JSON 404. |
| B3 | Extension import re-creates records with new ids, drops `createdAt`/`shares` → duplicates after delete + re-import | `importStashes(records)` in `lib/stash-store.ts`: append records whose id is absent, preserving id/createdAt/updatedAt/shares/tags/note; one `afterWrite("create")` per record so sync sees them. `StashesView` uses it. |
| B4 | Viewer "Save edited" always encodes against prod origin and drops tags/note | `encodeTabsToShareUrl(tabs, brotli, expiryHours, window.location.origin, data.title, data.tags, data.note)`. |
| B5 | Deleting a stash leaves its share URLs (full tab list) in legacy `stash-history` for ≤30d | `deleteStash` also removes `stash-history` entries whose `url` matches any of the record's `shares[].url` (helper in `lib/history.ts`). |
| B7 | ThemeSwitcher renders 52px wide, icons overlap (`flex-1` buttons in an unsized container; pre-`1d8b1d2` used `w-9`) | Buttons `w-9` instead of `flex-1`. Keep 3 states (redesign decides later). |

## E2E harness (zero-touch for agents)

1. Fixtures: regular fixtures encode with `EXPIRY_HOURS_MAP.never` instead of 24h (the `expired` fixture stays expired). Regenerate committed fixtures.
2. `global-setup.ts`: if the daemon binary (`STASH_DAEMON_BIN` or `/tmp/stash-daemon`) is missing and `go` is on PATH, build it (ensure `daemon/internal/viewer/dist` non-empty). If `go` is missing, warn and continue.
3. `packages/e2e/README.md` agent path: document the daemon build + `BROWSER_EXECUTABLE_PATH` (Chrome for Testing) for runtime specs.

## Verification

- `pnpm --filter @stash/server-core run test`, `pnpm --filter @stash/extension run test`, `pnpm --filter stash-viewer run test`
- `pnpm --filter @stash/e2e run test` → 55/55 from a clean state (no prebuilt `/tmp/stash-daemon`)
- `pnpm run validate`, `pnpm run build`
