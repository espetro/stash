#!/usr/bin/env bash
# Reproduce the TS<->Go CRDT interop spike end to end.
set -euo pipefail
cd "$(dirname "$0")"

D=data
B=./go/bin-darwin-arm64

echo "== build Go (native darwin/arm64, cgo) =="
( cd go && go build -o bin-darwin-arm64 . )

echo "== build Go (cross linux/amd64, cgo via zig cc) =="
( cd go && CGO_ENABLED=1 GOOS=linux GOARCH=amd64 \
    CC="zig cc -target x86_64-linux-gnu" \
    CGO_LDFLAGS="-lunwind" \
    go build -o bin-linux-amd64 . )

echo "== bun deps =="
( cd ts && bun install --silent )

mkdir -p "$D"

echo "== convergence: TS create -> Go mutate -> TS delete/add =="
bun ts/step1-create.ts   "$D/state1.bin"
"$B" step2                "$D/state1.bin" "$D/state2.bin"
bun ts/step3.ts          "$D/state2.bin" "$D/state3.bin"
"$B" materialize         "$D/state3.bin" > "$D/final-go.json"
bun ts/materialize.ts    "$D/state3.bin" > "$D/final-ts.json"
if diff -u "$D/final-go.json" "$D/final-ts.json"; then
  echo "CONVERGENCE: PASS (Go and TS materializations byte-identical)"
else
  echo "CONVERGENCE: FAIL"; exit 1
fi

echo "== delete-vs-edit conflict =="
bun ts/step1-create.ts   "$D/base.bin"
"$B" conflict-delete     "$D/base.bin" "$D/conflict_go.bin"   # Go deletes rec-a
bun ts/conflict.ts edit  "$D/base.bin" "$D/conflict_ts.bin"   # TS edits rec-a.title
echo "--- merged on Go side ---"
"$B" merge               "$D/conflict_go.bin" "$D/conflict_ts.bin"
echo "--- merged on TS side ---"
bun ts/conflict.ts merge "$D/conflict_go.bin" "$D/conflict_ts.bin"
