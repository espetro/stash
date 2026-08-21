#!/bin/bash
# Create sources zip for Firefox Add-ons (AMO) submission.
# AMO rejects archives containing ".." path segments, so the workspace layout
# is re-rooted: extension source at ./, first-party packages under packages/.
# Usage: ./scripts/create-sources-zip.sh [output-dir]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
EXTENSION_DIR="$ROOT_DIR/apps/extension"
OUTPUT_DIR="${1:-$EXTENSION_DIR/.output}"
SOURCES_DIR="$(mktemp -d)"
VERSION=$(node -p "require('$EXTENSION_DIR/package.json').version")

echo "Creating sources zip for Stash v$VERSION..."

# Extension source at the archive root
mkdir -p "$SOURCES_DIR/extension"
cp -r "$EXTENSION_DIR/entrypoints" "$SOURCES_DIR/extension/"
cp -r "$EXTENSION_DIR/lib" "$SOURCES_DIR/extension/"
cp -r "$EXTENSION_DIR/modules" "$SOURCES_DIR/extension/"
cp -r "$EXTENSION_DIR/public" "$SOURCES_DIR/extension/"
cp "$EXTENSION_DIR/package.json" "$EXTENSION_DIR/tsconfig.json" \
   "$EXTENSION_DIR/wxt.config.ts" "$EXTENSION_DIR/global.d.ts" \
   "$EXTENSION_DIR/env.d.ts" "$SOURCES_DIR/extension/" 2>/dev/null || true

# First-party workspace packages
mkdir -p "$SOURCES_DIR/packages"
for pkg in codec shared server-core theme; do
  cp -r "$ROOT_DIR/packages/$pkg" "$SOURCES_DIR/packages/$pkg"
  rm -rf "$SOURCES_DIR/packages/$pkg/node_modules"
done

# Workspace metadata + build instructions
cp "$ROOT_DIR/pnpm-workspace.yaml" "$SOURCES_DIR/"
cp "$ROOT_DIR/pnpm-lock.yaml" "$SOURCES_DIR/"
cp "$ROOT_DIR/package.json" "$SOURCES_DIR/package.json"
cp "$EXTENSION_DIR/SOURCES.md" "$SOURCES_DIR/README.md"

mkdir -p "$OUTPUT_DIR"
( cd "$SOURCES_DIR" && zip -qr "$OUTPUT_DIR/stashextension-$VERSION-sources.zip" . )
rm -rf "$SOURCES_DIR"

echo "✓ Created: $OUTPUT_DIR/stashextension-$VERSION-sources.zip"
echo "Upload this file to AMO when asked for source code."
