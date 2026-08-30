#!/bin/sh
# Stash daemon installer (F10, spec §7.2): universal curl|sh fallback that
# fetches a GoReleaser archive from GitHub Releases, in the style of
# <https://github.com/goreleaser/get>.
#
# Usage: curl -fsSL https://stash.illo.fyi/install.sh | sh
#        (downloads the latest release for your platform into ./stash-daemon
#        or $BIN_DIR)
#
# Environment:
#   BIN_DIR    install directory (default: /usr/local/bin, fallback ./bin)
#   STASH_REPO GitHub repo slug (default: espetro/stash)
set -eu

REPO="${STASH_REPO:-espetro/stash}"
NAME="stash-daemon"

# --- detect platform -------------------------------------------------------
OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *)
    echo "error: unsupported OS '$OS' (Windows: use winget or scoop)" >&2
    exit 1
    ;;
esac
case "$ARCH" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *)
    echo "error: unsupported architecture '$ARCH'" >&2
    exit 1
    ;;
esac

# --- resolve latest release ------------------------------------------------
if [ -n "${STASH_VERSION:-}" ]; then
  VERSION="$STASH_VERSION"
else
  # shellcheck disable=SC2016
  VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" |
    grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')"
fi
[ -n "$VERSION" ] || { echo "error: could not resolve latest release" >&2; exit 1; }

ASSET="${NAME}_${os}_${arch}.tar.gz"
URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"
echo "installing ${NAME} ${VERSION} (${os}/${arch}) from ${URL}"

# --- download and extract --------------------------------------------------
TMPDIR_DL="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_DL"' EXIT
curl -fsSL "$URL" | tar -xz -C "$TMPDIR_DL"
[ -f "${TMPDIR_DL}/${NAME}" ] || { echo "error: archive missing ${NAME} binary" >&2; exit 1; }

# --- install ---------------------------------------------------------------
BIN_DIR="${BIN_DIR:-/usr/local/bin}"
if [ ! -w "$BIN_DIR" ]; then
  BIN_DIR="${BIN_DIR:-$PWD/bin}"
  mkdir -p "$BIN_DIR"
fi
mkdir -p "$BIN_DIR"
mv "${TMPDIR_DL}/${NAME}" "${BIN_DIR}/${NAME}"
chmod +x "${BIN_DIR}/${NAME}"

echo "installed to ${BIN_DIR}/${NAME}"
case ":$PATH:" in
  *":${BIN_DIR}:"*) ;;
  *) echo "note: ${BIN_DIR} is not on your PATH" ;;
esac
echo "next: run '${BIN_DIR}/${NAME} install' to register the browser host,"
echo "then 'stash-daemon doctor' to verify."
