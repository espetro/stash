# Spike B — Go codec conformance

**Question:** can a Go port of `packages/codec` bidirectionally round-trip v6
payloads with the current TS codec, given that `brotli-wasm` (TS) and
`andybalholm/brotli` (Go) emit different compressed bytes?

**Answer: yes.** Semantic round-trip holds in both directions for all 13
fixtures. Byte output differs (expected); decoded items/metadata do not.

## Setup

- `go/main.go` — ~330 LOC. `github.com/vmihailenco/msgpack/v5` +
  `github.com/andybalholm/brotli` (q11 = `BestCompression`) + stdlib
  `encoding/base64` (URLEncoding, no pad) and `encoding/base32` (StdEncoding
  uppercase, no pad). Subcommands: `decode`, `encode`, `budget`.
- `ts/harness.ts` — `bun`, imports the real `packages/codec/src` directly
  (spike is outside the pnpm workspace on purpose), `brotli-wasm` CJS entry.
- Corpus: the 13 vectors in `packages/e2e/fixtures/payloads.json` (all v6).
- Run: `cd ts && bun install && bun run harness.ts`.

## 1. Bidirectional round-trip — PASS/FAIL per fixture

| fixture | Go decode == TS decode | reverse: Go encode -> TS decode | note |
|---|---|---|---|
| single-tab | PASS | PASS | - |
| three-tabs | PASS | PASS | - |
| five-tabs | PASS | PASS | - |
| long-title | PASS | PASS | - |
| special-chars | PASS | PASS | - |
| unicode | PASS | PASS | - |
| chrome-mixed | PASS | PASS | - |
| empty-items | n/a | n/a | empty fragment — codec refuses by design (both sides) |
| expired | PASS | PASS | - |
| hundred-tabs | PASS | PASS | - |
| qr-single-tab | PASS | PASS | - |
| qr-three-tabs | PASS | PASS | - |
| tagged-stash | PASS | PASS | - |

13/13 rows conform (12 asserted + `empty-items`, which both implementations
reject with "Invalid URL fragment format" — parity by refusal).

Forward = Go decode of the TS-authored fixture wire string equals the TS
codec's own decode (items, version, expiry, title, tags, note).
Reverse = rebuild tabs from the TS decode, Go-encode (matching transport:
`#p=` base64url / `#q=` base32), then TS-decode the Go output; items and
metadata match (expiry excluded on the reverse leg — re-encode stamps a
fresh one).

Covered by the corpus: `C`/`R`/`D` prefixes, the compression threshold
(200-byte raw msgpack), base64url and base32 alphabets, unicode, reserved
URL chars, `chrome://` URLs, title truncation, the `e` field, budget
truncation (`hundred-tabs`), and v6 `t`/`g`/`n`. Brotli output bytes differ
between Go and TS on every compressed fixture; nothing downstream cares.

## 2. v4/v5 coverage gap

**Confirmed: ZERO v4/v5 fixtures.** Every vector decodes as `version: 6`
(`packages/shared/fixtures/generate.ts` pins `PAYLOAD_VERSION = 6` and there
are no hand-authored legacy vectors anywhere in the repo). The TS decoder
still accepts `v === 4 || v === 5` but nothing exercises those paths.

**Spec decision needed.** A Go port has no v4/v5 test coverage. Either:
- (a) hand-author v4/v5 wire vectors as part of the port and hold the Go
  decoder to them (v4 = items are `[url, title]` 2-tuples, no top-level
  `g`/`n`; v5 adds the optional 3rd `kind` element; v6 adds `g`/`n`), or
- (b) drop v4/v5 from the daemon — legacy decode stays browser-only, and the
  Go path returns "Unsupported payload version" for `v < 6`.

Recommendation: (b). v4/v5 links are "already in the wild" legacy the
comment in `constants.ts` treats as sunset; the browser viewer keeps
decoding them. Not worth carrying dead format branches into a new runtime
with no fixtures to defend them.

## 3. Budget-boundary tab-count delta

`_findMaxTabsWithinBudget` sizes `BUDGET_CHARS` (8000) against the
**compressed** URL length, so different brotli ratios could seat a different
tab count at the boundary.

Measured: 400 synthetic tabs with high-entropy (non-compressible) tokens in
URL and title, binary-searched against `BUDGET_CHARS = 8000`, origin
`https://stash.illo.fyi`, across 12 deterministic PRNG seeds:

| seeds | TS max tabs | Go max tabs | tab-count delta |
|---|---|---|---|
| all 12 | 104 (seed 3/10/11: 105) | same as TS | **0** |

**Tab-count delta: 0** on every seed. At the boundary tab count (N=104), the
Go URL is **~18 bytes longer** than the TS URL (7937 vs 7919 chars) — Go's
q11 brotli is marginally looser — but 18 bytes is far below one tab's
contribution (~90 raw chars), so it never flips the count.

Caveat: the boundary is *soft*. A payload hand-tuned to sit within ~15–20
bytes of `BUDGET_CHARS` could differ by exactly 1 tab between runtimes.
Truncation is a lossy convenience, not a wire contract, so a 1-tab
disagreement at a pathological boundary is cosmetic — but if the daemon and
the extension must agree on truncation exactly, shave `BUDGET_CHARS` by a
small margin (e.g. 64 bytes) on whichever side compresses looser, or have
one side authoritative for truncation.

## Recommendation

Green-light the Go port: msgpack + brotli + base64url/base32 semantic
round-trip is solid in both directions with off-the-shelf Go libs. Fold two
items into the spec: (1) decide v4/v5 (recommend: daemon is v6-only, legacy
decode stays browser-only), (2) treat budget truncation as non-authoritative
in Go or trim `BUDGET_CHARS` by a safety margin.
