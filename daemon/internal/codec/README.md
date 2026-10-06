# daemon/internal/codec

Go port of the v6 share-payload codec (`packages/codec`): msgpack +
brotli + base64url (`#p=`) / base32 (`#q=`), prefixes `C`/`R` (URL adapter)
and `D`/`S` (QR adapter).

Conformance vectors live in the canonical shared fixture set
[`packages/shared/fixtures/payloads.json`](../../../../packages/shared/fixtures/payloads.json)
(schema: [`packages/shared/fixtures/payloads.md`](../../../../packages/shared/fixtures/payloads.md));
the Go tests read it cross-tree so there is exactly one source of truth.
Assertion invariant is **bidirectional semantic round-trip, never
byte-identical output** (Go `andybalholm/brotli` and TS `brotli-wasm` emit
different compressed bytes by design).

## Intentional divergences from the TS codec

Do not "fix" either of these; downstream modules (F11 test strategy, the
extension) rely on them being deliberate.

1. **v6-only decode.** The TS decoder (`packages/codec/src/decoder.ts:65`)
   still accepts `v === 4 || v === 5` for legacy links already in the wild.
   The repo carries zero v4/v5 fixtures, so this package returns
   `Unsupported payload version` for any `v < 6` (spec §4.6.1). Legacy decode
   stays browser-side only.
2. **Budget safety margin.** When encoding with budget truncation, this
   package budgets against `BUDGET_CHARS - 64` (64 bytes, spec §4.6.2)
   instead of `BUDGET_CHARS = 8000` raw. Spike B (spec Appendix B) measured
   Go brotli output running ~18 bytes longer than `brotli-wasm` at the
   boundary tab count; a payload tuned within ~15-20 bytes of the ceiling
   could otherwise flip by exactly one tab between runtimes. The margin
   makes that boundary unable to flip. The TS encoder keeps the un-margined
   budget.

## Error strings (shared contract with the TS decoder)

`Invalid URL fragment format`, `Invalid base64url encoding`,
`Invalid base32 encoding`, `Unknown payload prefix`,
`Failed to decompress payload`, `Invalid payload structure`,
`Unsupported payload version`. These are asserted in `codec_test.go`; do not
reword without updating consumers.

## Usage

```go
p, err := codec.DecodeShareURL("#p=Ck..." )   // full fragment
p, err := codec.DecodeEncodedPayload("Ck...") // bare fragment value
res, err := codec.EncodeTabsToShareURL(tabs, origin, 24, title, tags, note)
```

`stash_decode` (MCP tool) calls `DecodeEncodedPayload` directly; the v6-only
gate is enforced at the tool boundary by the same error.
