#!/usr/bin/env bash
# Install SAM 3 Tracker into the app models cache for local dev.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/.tmp/sam3-tracker/inlined"
DEST="${1:-$HOME/.config/Lee Label/Models/models/sam3-tracker/v1}"

if [[ ! -f "$SRC/encoder.fp16.onnx" || ! -f "$SRC/decoder.fp32.onnx" ]]; then
  echo "Missing inlined models under $SRC"
  exit 1
fi

mkdir -p "$DEST"
cp "$SRC/encoder.fp16.onnx" "$DEST/encoder.onnx"
cp "$SRC/decoder.fp32.onnx" "$DEST/decoder.onnx"
echo "Installed to $DEST"
ls -lh "$DEST"
