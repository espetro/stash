# LNA loopback spike (spec 12.2)

Question: does an MV3 extension service worker fetching `http://127.0.0.1`
trigger Chrome's Local Network Access (LNA) prompt on Chrome >= 142, and is the
SW exempt for loopback when `host_permissions` covers the URL?

Three unpacked MV3 variants, identical `sw.js` (fetches `http://127.0.0.1:17777/`
at cold start + t+5s + t+10s, logging `LNA_SPIKE ...` lines):

- `variant-host-perms/` - `host_permissions: ["http://127.0.0.1/*"]`
- `variant-perms/` - URL pattern in `permissions` instead
- `variant-none/` - no permissions at all

## Re-run manually

1. Start a server: `mkdir -p /tmp/lna-serve && echo hi > /tmp/lna-serve/index.html`
   then `python3 -m http.server 17777 --bind 127.0.0.1` from `/tmp/lna-serve`.
2. Branded Google Chrome ignores `--load-extension`, so use Chromium / Chrome for
   Testing (e.g. the Playwright cache at
   `~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/...`):

```
"$CHROME_FOR_TESTING" \
  --user-data-dir=/tmp/lna-profile-1 --no-first-run --no-default-browser-check \
  --enable-logging=stderr --v=1 \
  --load-extension="$PWD/variant-host-perms" about:blank \
  > /tmp/lna-chrome-1.log 2>&1 &
# wait ~15s, kill, then:
grep LNA_SPIKE /tmp/lna-chrome-1.log
```

Repeat per variant with fresh profile dirs. A prompt would appear in the window
(human eye required); log evidence is `FETCH_OK` vs `FETCH_FAIL Failed to fetch`.

## Result (2026-08-29)

Tested on Google Chrome for Testing 151.0.7922.34 (branded Google Chrome
152.0.7977.64 refuses `--load-extension`, so could not be used directly).
See `.agents/docs/local-first-replatform-spec.md` section 12.2 and the W5
Outcome in `.agents/plans/2026-08-29-local-first-f01-transport.md`.

Not wired into turbo, CI, or `pnpm run validate`; `pnpm-workspace.yaml` globs
only `apps/*` and `packages/*` so this dir is inert.
