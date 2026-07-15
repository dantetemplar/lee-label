#!/usr/bin/env python3
"""Rewrite SAM2 decoder: replace coords[:,:,c]=coords[:,:,c]/1024 ScatterNDs with broadcast Div.

Torch ONNX exports channel-wise assignment as ScatterND, which ORT WebGPU mishandles
on the first box decode. Mathematically:

  coords = cat([point_coords + 0.5, pad_zeros], dim=1)
  coords[:, :, 0] = coords[:, :, 0] / 1024   # ScatterND
  coords[:, :, 1] = coords[:, :, 1] / 1024   # ScatterND_1

≡

  coords = cat([point_coords + 0.5, pad_zeros], dim=1) / 1024

Usage:
  python3 scripts/models-experiments/rewrite-sam2-decoder-noscatter.py \\
    --in ~/.config/Lee\\ Label/Models/models/sam2.1-tiny/v1/decoder.onnx \\
    --out scripts/models-experiments/optimize-out/sam2.1-tiny/v1/decoder.noscatter.onnx
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnx
from onnx import helper, numpy_helper


def dead_code_eliminate(g: onnx.GraphProto) -> None:
  needed = {o.name for o in g.output}
  progress = True
  while progress:
    progress = False
    for n in g.node:
      if any(o in needed for o in n.output):
        for i in n.input:
          if i and i not in needed:
            needed.add(i)
            progress = True
  keep = [n for n in g.node if any(o in needed for o in n.output)]
  del g.node[:]
  g.node.extend(keep)


def rewrite(model: onnx.ModelProto) -> onnx.ModelProto:
  g = model.graph
  scatter_nodes = [n for n in g.node if n.op_type == "ScatterND"]
  if len(scatter_nodes) < 2:
    raise SystemExit(f"expected ≥2 ScatterND, found {len(scatter_nodes)}")

  first = next(n for n in g.node if n.name == "/ScatterND")
  last = next(n for n in g.node if n.name == "/ScatterND_1")
  padded = first.input[0]  # /Concat_2_output_0
  final_out = last.output[0]  # /ScatterND_1_output_0
  scale_name = "/Constant_9_output_0"

  # Produce the final tensor name directly via Div (Mul_6 already consumes final_out).
  div = helper.make_node(
    "Div", inputs=[padded, scale_name], outputs=[final_out], name="/coords_norm_noscatter"
  )

  keep = [n for n in g.node if n.name not in ("/ScatterND", "/ScatterND_1")]
  del g.node[:]
  inserted = False
  for n in keep:
    g.node.append(n)
    if n.name == "/Concat_2" and not inserted:
      g.node.append(div)
      inserted = True
  if not inserted:
    g.node.append(div)

  dead_code_eliminate(g)

  left = [n.name for n in g.node if n.op_type == "ScatterND"]
  if left:
    raise SystemExit(f"ScatterND still present: {left}")
  return model


def check_allclose(src: Path, dst: Path, rtol=1e-4, atol=1e-4) -> None:
  import onnxruntime as ort

  a = ort.InferenceSession(str(src), providers=["CPUExecutionProvider"])
  b = ort.InferenceSession(str(dst), providers=["CPUExecutionProvider"])
  ie = np.random.randn(1, 256, 64, 64).astype(np.float32) * 0.01
  h0 = np.random.randn(1, 32, 256, 256).astype(np.float32) * 0.01
  h1 = np.random.randn(1, 64, 128, 128).astype(np.float32) * 0.01
  cases = {
    "box": (
      np.array([[[100.0, 120.0], [200.0, 220.0]]], np.float32),
      np.array([[2.0, 3.0]], np.float32),
    ),
    "pos": (
      np.array([[[150.0, 160.0]]], np.float32),
      np.array([[1.0]], np.float32),
    ),
    "pos_neg": (
      np.array([[[150.0, 160.0], [50.0, 60.0]]], np.float32),
      np.array([[1.0, 0.0]], np.float32),
    ),
  }
  for name, (pts, labs) in cases.items():
    feeds = {
      "point_coords": pts,
      "point_labels": labs,
      "image_embed": ie,
      "high_res_feats_0": h0,
      "high_res_feats_1": h1,
      "mask_input": np.zeros((1, 1, 256, 256), np.float32),
      "has_mask_input": np.array([0], np.float32),
    }
    oa = a.run(None, feeds)
    ob = b.run(None, feeds)
    for i, (x, y) in enumerate(zip(oa, ob)):
      diff = np.max(np.abs(x - y))
      ok = np.allclose(x, y, rtol=rtol, atol=atol)
      print(f"  {name} out{i} max_abs={diff:.6g} allclose={ok}")
      if not ok:
        raise SystemExit(f"mismatch on {name} out{i}")


def main() -> None:
  ap = argparse.ArgumentParser()
  ap.add_argument("--in", dest="inp", type=Path, required=True)
  ap.add_argument("--out", type=Path, required=True)
  ap.add_argument("--skip-check", action="store_true")
  args = ap.parse_args()

  model = onnx.load(str(args.inp))
  model = rewrite(model)
  args.out.parent.mkdir(parents=True, exist_ok=True)
  onnx.save(model, str(args.out))
  print("wrote", args.out, "bytes", args.out.stat().st_size)
  left = sum(1 for n in model.graph.node if n.op_type == "ScatterND")
  print("ScatterND count:", left)
  if not args.skip_check:
    print("CPU numeric check vs original…")
    check_allclose(args.inp, args.out)


if __name__ == "__main__":
  main()
