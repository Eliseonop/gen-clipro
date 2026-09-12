#!/usr/bin/env bash
# Construye la herramienta Paper Animator (motor de Paperima vendorizado en
# tools/paper-animator) y la deja en frontend/public/paper-animator/, que es de
# donde el iframe de PaperAnimatorModal carga /paper-animator/index.html?embed=1.
#
# Uso:  bash scripts/build-paper-animator.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO/tools/paper-animator"
DEST="$REPO/frontend/public/paper-animator"

if [ ! -f "$SRC/package.json" ]; then
  echo "no encuentro el motor en: $SRC" >&2
  exit 1
fi

cd "$SRC"
if [ ! -d node_modules ]; then
  echo ">> npm install (primera vez)"
  npm install
fi

echo ">> vite build -> $DEST"
npm run build

echo ">> listo. Contenido de $DEST:"
ls -1 "$DEST"
