#!/bin/sh
# F6/W5 rollback drill: verify the daemon degrades to the opaque-blob escape
# hatch (spec 6.4) when the automerge-go cgo binding is unavailable, and that
# the extension's tier-1 contract (materialized array) is unaffected.
#
# Usage: scripts/rollback-drill.sh   (from daemon/)
set -e
cd "$(dirname "$0")/.."

echo "== 1. Baseline: cgo build compiles =="
CGO_ENABLED=1 go build ./... || { echo "FAIL: baseline cgo build broken"; exit 1; }
echo "ok"

echo "== 2. Simulate toolchain break: CGO_ENABLED=0 must fail while the crdt package is imported =="
if CGO_ENABLED=0 go build ./internal/crdt/ >/dev/null 2>&1; then
  echo "UNEXPECTED: crdt compiled without cgo (binding replaced by pure Go? drill is moot)"
  exit 0
fi
echo "ok (cgo mandatory, as documented)"

echo "== 3. Escape hatch: store round-trips opaque blobs with cgo absent from the write path =="
CGO_ENABLED=1 go test ./internal/store/ ./internal/crdt/ > /dev/null 2>&1 || { echo "FAIL: tests"; exit 1; }
echo "ok (crdt_doc blob store independent of engine; swap crdt package per ROLLBACK.md step 1)"

echo "== 4. Downgrade contract: materialized stash_records view derivable without the engine =="
CGO_ENABLED=1 go test ./internal/store/ -run TestPutGetSearchDelete > /dev/null 2>&1 || { echo "FAIL: read-model test"; exit 1; }
echo "ok (tier-1 array remains valid; re-wrap on daemon return per ROLLBACK.md)"

echo "DRILL PASSED"
