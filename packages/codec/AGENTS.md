# packages/codec

Payload encode/decode shared by the extension, viewer, and shortener.

## Payload versioning

Current schema: **v6** (`PAYLOAD_VERSION` in `src/constants.ts`), which
adds optional top-level `tags` and `note`. The decoder accepts v4, v5,
and v6; v4/v5 are decode-only legacy and must never be emitted. Any
bump to `PAYLOAD_VERSION` requires: decoder support for the new version
plus all prior ones, and a passing regression test asserting
`decodeShareUrl(encodePayloadToUrl(...)).version === PAYLOAD_VERSION`
(see `src/__tests__/roundtrip.test.ts`) so encoder and decoder can
never silently desync across deployed surfaces.

## Tests

```bash
pnpm --filter @stash/codec run test
```
