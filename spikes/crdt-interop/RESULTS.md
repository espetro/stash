# Spike A — TS <-> Go CRDT interop

Date: 2026-08-29. Timeboxed (~40 min). Host: darwin/arm64, Go 1.25.5, Bun 1.3.14,
Zig 0.16.0, Rust 1.98.

Goal: turn the spec's riskiest claim — TS <-> Go CRDT convergence over a
`StashRecord` list — into evidence.

## Checkpoint zero — binding viability

| Binding | `go get` | darwin/arm64 builds? | linux/amd64 cross-builds from darwin/arm64? | cgo required? | binary size (delta vs plain-Go baseline) |
|---|---|---|---|---|---|
| **`github.com/automerge/automerge-go`** (`v0.0.0-20241030180337-6fb4f2d08244`) | clean, no replace needed | **YES** — `go build` works out of the box, ~31s cold | **YES** — needs `CC="zig cc -target x86_64-linux-gnu"` + `CGO_LDFLAGS="-lunwind"`; produces valid `x86_64` ELF (glibc, dynamically linked). First zig invocation ~2 min (builds its libc shim), then cached | **YES** (`CGO_ENABLED=0` fails to compile) | darwin: 4.1 MB (+1.8 MB); linux: 5.5 MB (+3.3 MB, not stripped) |
| y-crdt `yffi` + hand-written cgo wrapper | not attempted | — | — | — | — |
| neither practical | n/a | — | — | — | — |

Why `automerge-go` works cleanly: it vendors prebuilt static cores for all four
targets in `deps/` (`libautomerge_core_{darwin,linux}_{arm64,amd64}.a`, 1.7-2.6 MB
each) and selects them via `#cgo <os>,<arch> LDFLAGS` build tags. No Rust
toolchain, no network, no `cbindgen` at build time. Cross-compile only needs a
C cross-linker; the vendored `linux_amd64` core is a Rust staticlib that
references `_Unwind_*`, hence the explicit `-lunwind`.

Candidate 2 (yffi wrapper) was **not needed** — candidate 1 did not fail fast.

## Convergence test — PASS

Flat assertions (`automerge-go` binding):

- TS creates doc + 2 records (`rec-a`, `rec-b`), saves binary: **PASS**
- Go loads TS binary, edits `rec-a.title`, appends `rec-c`, saves: **PASS**
- TS loads Go binary, deletes `rec-b`, appends `rec-d`, saves: **PASS**
- Final state materialized independently by Go and by TS is **byte-identical**
  (`diff` empty): **PASS**
  - final record order/ids on both sides: `rec-a, rec-c, rec-d`
  - `rec-a.title` = `"Morning reading (edited by Go)"` (Go's edit survived the
    TS round-trip); all nested fields (`tags`, `note`, `items[].url/title`,
    `createdAt`, `updatedAt`) match

Interop gotcha found and handled (in `go/main.go`): Automerge-JS stores integral
JS numbers as **int64**, while `automerge-go`'s `Value.Float64()` panics on an
int64 value. A 3-line `num()` helper that switches on `Value.Kind()`
(`KindInt64` / `KindUint64` / `KindFloat64`) resolves it. Writers on both sides
should agree on the numeric type per field (spike writes `int64` from Go to
match JS).

Second `automerge-go` gotcha: a `Path(...).List()` handle supports `Get` /
`Append` but **not `Delete`** (nil `objID` deref). Must resolve a concrete
objID-bound list via `doc.RootMap().Get("records").List()`.

## delete-vs-edit conflict — delete wins, both sides converge

Setup: common base (`rec-a`, `rec-b`). Concurrently: Go deletes `rec-a`; TS edits
`rec-a.title` -> `"EDITED BY TS"`. Merge performed independently on each side.

- Merge on Go side -> records: `[rec-b]`
- Merge on TS side -> records: `[rec-b]`
- Identical on both sides. **The concurrent delete wins; the concurrent field
  edit is discarded.** No tombstone resurrection, no duplicate, no error.

This is standard Automerge list-element semantics: removing a list element drops
it and any concurrent edits to its interior. If "edit resurrects / wins" is
desired, the data model would need soft-delete (a `deleted` boolean field) instead
of actual list removal.

## Recommendation

**Adopt real CRDT sync via `automerge-go` + `@automerge/automerge` (2.x wire
format).** The convergence claim holds: clean bidirectional TS <-> Go merge with
byte-identical materialization, and cross-compilation to `linux/amd64` from the
darwin/arm64 dev host is a solved problem (zig cc + `-lunwind`). Accept the
constraints: cgo is mandatory (no `CGO_ENABLED=0` builds, ~+2-3 MB binary), and
the Go wrapper has rough edges (int64/float64, path-list `Delete`) that need
thin defensive helpers. The opaque-blob escape hatch / import-export fallback is
**not** required by any finding here.

## Files

- `go/main.go` — Go side (`step2`, `materialize`, `conflict-delete`, `merge`)
- `ts/step1-create.ts`, `ts/step3.ts`, `ts/materialize.ts`, `ts/conflict.ts`, `ts/lib.ts`
- `run.sh` — reproduces everything end to end
