# Store publishing (automated)

`release.yml` has a `publish` job that submits the built extension zips to the
browser stores on every `v*` tag push, via
[`publish-browser-extension`](https://github.com/wxt-dev/publish-browser-extension)
(the same engine `wxt submit` aliases — we call it directly at `^5` for the
Chrome Web Store API v2 flags the vendored 4.x lacks).

## What runs on a tag

- **Firefox (AMO)** — always submitted. `publish-extension --firefox-zip …
  --firefox-sources-zip …`; the sources zip is a `git archive` of the tag,
  satisfying AMO's source-submission policy for bundled code.
- **Chrome Web Store** — runs only when the repo variable
  `CHROME_PUBLISH_ENABLED == 'true'`. Until then the step is skipped and the
  job still succeeds.

Both submissions upload + submit for review; nothing goes live until the
store's review passes (review itself is never automatable).

## Configuration

Non-secret values live in repo **variables**; credentials in repo **secrets**.

### Firefox (already configured — owner did it)

| Kind | Name | Value |
|------|------|-------|
| variable | `FIREFOX_EXTENSION_ID` | `stash@stash-extension` (gecko id; the AMO slug works too) |
| secret | `FIREFOX_JWT_ISSUER` | AMO → Developer Hub → "Manage API Keys" → JWT issuer |
| secret | `FIREFOX_JWT_SECRET` | same page → JWT secret |

### Chrome (enable when ready)

1. In Google Cloud Console: create a project, enable the **Chrome Web Store
   API**, create a **service account** and download its JSON key.
2. Grant the service account access to the publisher per
   https://developer.chrome.com/docs/webstore/using-service-accounts
3. Set repo variables:
   - `CHROME_PUBLISH_ENABLED` = `true`
   - `CHROME_EXTENSION_ID` = `npkcdanhacbmbinabhogbngifebkfpeo`
   - `CHROME_PUBLISHER_ID` = publisher id from Developer Dashboard →
     Publisher → Settings
4. Set repo secrets from the JSON key:
   - `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` = `client_email`
   - `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` = `private_key` (paste the whole
     `-----BEGIN PRIVATE KEY-----…` block; GitHub secrets preserve newlines)

The v2 API also supports staged rollouts (`--chrome-publish-type
STAGED_PUBLISH`), `cancel-pending`, and `set-deploy-percentage` — edit the
`publish` job if we want those.

## Local runs / debugging

```bash
# auth check only, uploads nothing
cd apps/extension
FIREFOX_JWT_ISSUER=… FIREFOX_JWT_SECRET=… FIREFOX_EXTENSION_ID=stash@stash-extension \
  pnpm exec publish-extension --firefox-zip .output/stashextension-*-firefox.zip --dry-run
```

`publish-extension` also auto-loads a `.env.submit` file (created by
`wxt submit init`); it's covered by the `.env*` gitignore.

## Caveats

- The tool exposes no *approval-notes* field: if an AMO reviewer needs the
  `nativeMessaging` justification, answer via `STORE_LISTING.nativeMessaging.md`
  content in the reviewer thread (first automated submission may need a manual
  note in the AMO UI since `nativeMessaging` is a new permission).
- `FIREFOX_CHANNEL` is `listed`; AMO listed submissions aren't signed
  immediately — that's normal, not a job failure.
