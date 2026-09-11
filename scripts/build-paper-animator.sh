#!/usr/bin/env bash
# Build the Paper Animator tool (trimmed paperima) and deploy it into the
# editor's public/ dir, where the PaperAnimatorModal iframe loads it from
# /paper-animator/index.html?embed=1.
#
# Usage:  bash scripts/build-paper-animator.sh [path-to-paperima]
# Default paperima source: E:\proyectos\paperima  (../paperima relative to repo)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$REPO/../paperima}"
DEST="$REPO/frontend/public/paper-animator"

if [ ! -f "$SRC/package.json" ]; then
  echo "paperima source not found at: $SRC" >&2
  exit 1
fi

echo ">> building paperima (embed, no PWA) from $SRC"
( cd "$SRC" && PAPERIMA_EMBED=1 npm run build )

echo ">> deploying to $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -r "$SRC/dist/"* "$DEST/"

# Upstream CSS references the Inter font one directory too deep
# (assets/index.css -> ./assets/font/...). Mirror the font to that path so the
# embedded tool has no 404.
if [ -d "$DEST/assets/font" ]; then
  mkdir -p "$DEST/assets/assets/font"
  cp "$DEST/assets/font/"* "$DEST/assets/assets/font/" 2>/dev/null || true
fi

echo ">> done. Files in $DEST:"
ls -1 "$DEST"
