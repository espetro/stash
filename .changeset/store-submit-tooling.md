---
"@stash/extension": patch
---

chore(extension): automated store submission via publish-browser-extension

`release.yml` gains a `publish` job that submits the tag's zips to the
stores: Firefox AMO always (JWT creds + `git archive` sources zip),
Chrome Web Store once `CHROME_PUBLISH_ENABLED` + the CWS API v2
service-account secrets are configured. Setup documented in
`.agents/docs/store-publishing.md`; manual dashboard upload remains the
fallback.
