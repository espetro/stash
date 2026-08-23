---
"@stash/shared": minor
---

Move canonical payload fixtures into `@stash/shared` (`fixtures/payloads.json`, `fixtures/sample-tabs.json`) with a pure loader exported from the new `./fixtures` subpath (`loadPayloadFixtures`, `PayloadFixture`), and add `#q=` QR fixtures (`qr-single-tab`, `qr-three-tabs`) plus a v6 metadata fixture (`tagged-stash`). Also add a shared content-negotiation contract (`negotiation.ts`: `negotiateFormat`, `FORMAT_ALIASES`, `isValidFormatParam`, `NEGOTIATION_CASES`) that the viewer and server-core will consume.
