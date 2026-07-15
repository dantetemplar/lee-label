#!/usr/bin/env bash
# Package SAM 3 Tracker for Lee Label release / local install.
# Requires inlined ONNX under .tmp/sam3-tracker/inlined/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/.tmp/sam3-tracker/inlined"
STAGING="$ROOT/.tmp/sam3-tracker/staging/sam3-tracker/v1"
OUT_DIR="${OUT_DIR:-$ROOT/.tmp/release-zips}"
OUT_ZIP="$OUT_DIR/model-sam3-tracker-v1.zip"

if [[ ! -f "$SRC/encoder.fp16.onnx" || ! -f "$SRC/decoder.fp32.onnx" ]]; then
  echo "Missing inlined models. Expected:"
  echo "  $SRC/encoder.fp16.onnx"
  echo "  $SRC/decoder.fp32.onnx"
  exit 1
fi

rm -rf "$ROOT/.tmp/sam3-tracker/staging"
mkdir -p "$STAGING" "$OUT_DIR"
cp "$SRC/encoder.fp16.onnx" "$STAGING/encoder.onnx"
cp "$SRC/decoder.fp32.onnx" "$STAGING/decoder.onnx"
rm -f "$OUT_ZIP"
(cd "$ROOT/.tmp/sam3-tracker/staging" && zip -r "$OUT_ZIP" sam3-tracker)

echo "Wrote $OUT_ZIP"
ls -lh "$OUT_ZIP"
