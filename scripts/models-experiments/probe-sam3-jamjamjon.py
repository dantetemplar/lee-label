#!/usr/bin/env python3
"""Probe jamjamjon SAM3 tracker (fp16 vision + fp32 prompt/mask decoder).

Models: https://github.com/jamjamjon/assets/releases/tag/sam3
  tracker-vision-encoder-fp16.onnx
  tracker-prompt-encoder-mask-decoder.onnx

Usage:
  python3 scripts/models-experiments/probe-sam3-jamjamjon.py \\
    --image /path/to.png --point 0.32,0.40
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.tmp' / 'sam3-jamjamjon'
SIZE = 1008


def main() -> None:
  ap = argparse.ArgumentParser()
  ap.add_argument('--image', type=Path, required=True)
  ap.add_argument('--point', type=str, default='0.32,0.40', help='Normalized x,y')
  ap.add_argument('--out', type=Path, default=CACHE / 'probe-overlay.png')
  args = ap.parse_args()
  px, py = [float(x) for x in args.point.split(',')]

  enc_path = CACHE / 'tracker-vision-encoder-fp16.onnx'
  dec_path = CACHE / 'tracker-prompt-encoder-mask-decoder.onnx'
  if not enc_path.exists() or not dec_path.exists():
    raise SystemExit(f'Missing models under {CACHE}')

  img = Image.open(args.image).convert('RGB')
  w, h = img.size
  arr = np.asarray(img.resize((SIZE, SIZE), Image.BILINEAR)).astype(np.float32) / 255.0
  chw = np.zeros((1, 3, SIZE, SIZE), np.float32)
  for c in range(3):
    chw[0, c] = (arr[:, :, c] - 0.5) / 0.5

  enc = ort.InferenceSession(str(enc_path), providers=['CPUExecutionProvider'])
  dec = ort.InferenceSession(str(dec_path), providers=['CPUExecutionProvider'])
  e0, e1, e2 = enc.run(None, {'pixel_values': chw})

  mx, my = px * SIZE, py * SIZE
  points = np.array([[[[mx, my]]]], np.float32)
  labels = np.array([[[1]]], np.int64)
  boxes = np.zeros((1, 0, 4), np.float32)
  iou, masks, obj = dec.run(
    None,
    {
      'input_points': points,
      'input_labels': labels,
      'input_boxes': boxes,
      'image_embeddings.0': e0,
      'image_embeddings.1': e1,
      'image_embeddings.2': e2,
    },
  )
  scores = iou[0, 0]
  best = int(np.argmax(scores))
  areas = [float((masks[0, 0, i] > 0).mean()) for i in range(3)]
  print(f'point scores={scores} best={best} areas={areas} obj={obj[0,0,0]:.3f}')

  m = (masks[0, 0, best] > 0).astype(np.uint8)
  m_img = Image.fromarray(m * 255).resize((w, h), Image.NEAREST)
  overlay = img.copy().convert('RGBA')
  red = Image.new('RGBA', (w, h), (255, 40, 40, 0))
  red.putalpha(m_img.point(lambda p: 110 if p > 0 else 0))
  out = Image.alpha_composite(overlay, red)
  draw = ImageDraw.Draw(out)
  draw.ellipse([px * w - 5, py * h - 5, px * w + 5, py * h + 5], fill=(0, 255, 0))
  args.out.parent.mkdir(parents=True, exist_ok=True)
  out.convert('RGB').save(args.out)
  print('saved', args.out)


if __name__ == '__main__':
  main()
