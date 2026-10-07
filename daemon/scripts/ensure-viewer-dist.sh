#!/bin/sh
# go:embed all:dist in internal/viewer/viewer.go requires a non-empty
# internal/viewer/dist at compile time. Lint/vet/test don't need the real
# viewer build — they only need the pattern to resolve — so stub it when
# absent. The real build (scripts/build.sh) rm -rf's this tree and copies
# apps/viewer/dist in; it fails loudly when that artifact is missing.
set -e
cd "$(dirname "$0")/.."
mkdir -p internal/viewer/dist
touch internal/viewer/dist/.placeholder
