#!/bin/bash
# Create sources zip for Firefox Add-ons (AMO) submission
# Usage: ./scripts/create-sources-zip.sh [output-dir]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
EXTENSION_DIR="$ROOT_DIR/apps/extension"
OUTPUT_DIR="${1:-$ROOT_DIR/apps/extension/.output}"
SOURCES_DIR="/tmp/stash-sources-$$"
VERSION=$(node -p "require('$EXTENSION_DIR/package.json').version")

echo "Creating sources zip for Stash v$VERSION..."

# Create temp directory
mkdir -p "$SOURCES_DIR"

# Copy extension source files
echo "Copying extension source files..."
cp -r "$EXTENSION_DIR/entrypoints" "$SOURCES_DIR/"
cp -r "$EXTENSION_DIR/lib" "$SOURCES_DIR/"
cp -r "$EXTENSION_DIR/public" "$SOURCES_DIR/"
cp "$EXTENSION_DIR/package.json" "$SOURCES_DIR/"
cp "$EXTENSION_DIR/tsconfig.json" "$SOURCES_DIR/"
cp "$EXTENSION_DIR/wxt.config.ts" "$SOURCES_DIR/"
cp "$EXTENSION_DIR/SOURCES.md" "$SOURCES_DIR/README.md"

# Copy workspace files
echo "Copying workspace files..."
cp "$ROOT_DIR/pnpm-workspace.yaml" "$SOURCES_DIR/"
cp "$ROOT_DIR/pnpm-lock.yaml" "$SOURCES_DIR/"
cp "$ROOT_DIR/package.json" "$SOURCES_DIR/root-package.json"

# Create zip
echo "Creating zip..."
mkdir -p "$OUTPUT_DIR"
cd "$SOURCES_DIR"
zip -r "$OUTPUT_DIR/stash-sources-$VERSION.zip" .
cd "$ROOT_DIR"

# Cleanup
rm -rf "$SOURCES_DIR"

echo "✓ Created: $OUTPUT_DIR/stash-sources-$VERSION.zip"
echo ""
echo "Upload this file to AMO when asked for source code."
