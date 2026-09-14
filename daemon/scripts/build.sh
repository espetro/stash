#!/bin/sh
# F12/W4: build the daemon with the built viewer embedded via go:embed.
#
# Contract:
#   1. apps/viewer/dist must exist and be a real build (Turbo orders
#      daemon build after viewer build via the dependency edge in
#      daemon/package.json).
#   2. internal/viewer/dist is refreshed from apps/viewer/dist; go:embed
#      requires the tree to live inside the module.
#   3. Fail loudly (not silently) when the viewer artifact is missing.
#      A stale embedded viewer is the main failure mode (plan W4).
#
# Note: a fully self-contained loopback shell (no PostHog, no Google
# Fonts) is produced by building the viewer with VITE_EMBEDDED_VIEWER=1
# (see apps/viewer/src/layouts/ViewerLayout.astro). The hosted build in
# CI (VITE_VIEWER_ORIGIN=https://stash.illo.fyi) also renders and decodes
# locally; fragments are decoded client-side either way.
set -e
cd "$(dirname "$0")/.."
ROOT="$(git rev-parse --show-toplevel)"
SRC="$ROOT/apps/viewer/dist"
DST="internal/viewer/dist"

if [ ! -f "$SRC/index.html" ]; then
  echo "ERROR: apps/viewer/dist/index.html not found." >&2
  echo "Run 'pnpm --filter stash-viewer build' first; go:embed refuses a placeholder-free empty tree." >&2
  exit 1
fi

rm -rf "$DST"
mkdir -p "$DST"
cp -R "$SRC/." "$DST/"

CGO_ENABLED=1 go build -o bin/stash-daemon ./cmd/stash-daemon
echo "daemon built: daemon/bin/stash-daemon (viewer embedded from $(git -C "$ROOT" log -1 --format=%h -- "$SRC" 2>/dev/null || echo untracked) viewer dist)"
