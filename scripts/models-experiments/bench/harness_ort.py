#!/usr/bin/env python3
"""GT prompt harness via onnxruntime CUDA (or CPU fallback).

Same prompts as Electron harness:
  - box around capacitor (from test-image.txt polygon)
  - positive center + negative outside
  - positive only

Usage:
  .tmp/venv-ort-gpu/bin/python scripts/models-experiments/bench/harness_ort.py
  .tmp/venv-ort-gpu/bin/python scripts/models-experiments/bench/harness_ort.py --model sam-hq-tiny --provider cuda
  .tmp/venv-ort-gpu/bin/python scripts/models-experiments/bench/harness_ort.py --provider cpu
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
IMAGE = ROOT / "test-image.png"
GT_TXT = ROOT / "test-image.txt"
MODELS_JSON = Path(__file__).resolve().parent / "models.json"
MODELS_DIR = Path.home() / ".config" / "Lee Label" / "Models"
OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(parents=True, exist_ok=True)

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def parse_gt(txt: str):
  parts = list(map(float, txt.split()))
  xs = parts[1::2]
  ys = parts[2::2]
  pad = 0.002
  bbox = {
    "x1": max(0.0, min(xs) - pad),
    "y1": max(0.0, min(ys) - pad),
    "x2": min(1.0, max(xs) + pad),
    "y2": min(1.0, max(ys) + pad),
  }
  cx = float(np.mean(xs))
  cy = float(np.mean(ys))
  w = bbox["x2"] - bbox["x1"]
  neg = {"x": max(0.01, bbox["x1"] - max(0.03, w * 0.8)), "y": (bbox["y1"] + bbox["y2"]) / 2}
  poly = list(zip(xs, ys))
  return {"bbox": bbox, "center": {"x": cx, "y": cy}, "neg": neg, "polygon": poly}


def rasterize(poly, W, H):
  img = Image.new("L", (W, H), 0)
  draw = ImageDraw.Draw(img)
  pts = [(x * W, y * H) for x, y in poly]
  draw.polygon(pts, fill=1)
  return np.asarray(img, dtype=np.uint8)


def iou(pred: np.ndarray, gt: np.ndarray, thr: float = 0.0) -> float:
  p = (pred > thr).astype(np.uint8)
  g = gt.astype(np.uint8)
  inter = int(np.logical_and(p, g).sum())
  uni = int(np.logical_or(p, g).sum())
  return inter / uni if uni else 0.0


def mask_to_image(mask: np.ndarray, H: int, W: int, mode: str = "letterbox") -> np.ndarray:
  """Map model-space logits → image HxW (bilinear), matching app postProcessMasks."""
  mh, mw = mask.shape
  if mh == H and mw == W:
    return mask.astype(np.float32)
  out = np.zeros((H, W), dtype=np.float32)
  if mode == "stretch":
    ys = (np.arange(H) + 0.5) * mh / H
    xs = (np.arange(W) + 0.5) * mw / W
  else:
    long = max(W, H)
    ys = (np.arange(H) + 0.5) * mh / long
    xs = (np.arange(W) + 0.5) * mw / long
  ys = np.clip(ys, 0, mh - 1)
  xs = np.clip(xs, 0, mw - 1)
  y0 = np.floor(ys).astype(np.int32)
  x0 = np.floor(xs).astype(np.int32)
  y1 = np.minimum(y0 + 1, mh - 1)
  x1 = np.minimum(x0 + 1, mw - 1)
  fy = (ys - y0).astype(np.float32)
  fx = (xs - x0).astype(np.float32)
  for yi, y in enumerate(range(H)):
    for xi, x in enumerate(range(W)):
      yy0, yy1, xx0, xx1 = y0[yi], y1[yi], x0[xi], x1[xi]
      fyy, fxx = fy[yi], fx[xi]
      out[y, x] = (
        mask[yy0, xx0] * (1 - fxx) * (1 - fyy)
        + mask[yy0, xx1] * fxx * (1 - fyy)
        + mask[yy1, xx0] * (1 - fxx) * fyy
        + mask[yy1, xx1] * fxx * fyy
      )
  return out


def letterbox(img: np.ndarray, size=1024):
  H, W = img.shape[:2]
  scale = size / max(H, W)
  nw, nh = int(round(W * scale)), int(round(H * scale))
  resized = np.array(Image.fromarray(img).resize((nw, nh), Image.BILINEAR))
  canvas = np.zeros((size, size, 3), dtype=np.uint8)
  canvas[:nh, :nw] = resized
  x = canvas.astype(np.float32) / 255.0
  x = (x - MEAN) / STD
  # CHW
  return np.transpose(x, (2, 0, 1))[None].astype(np.float32), scale


def stretch_f32(img: np.ndarray, size=1008, mean=0.5, std=0.5):
  resized = np.array(Image.fromarray(img).resize((size, size), Image.BILINEAR))
  x = resized.astype(np.float32) / 255.0
  x = (x - mean) / std
  return np.transpose(x, (2, 0, 1))[None].astype(np.float32)


def stretch_u8(img: np.ndarray, size=1008):
  resized = np.array(Image.fromarray(img).resize((size, size), Image.BILINEAR))
  return np.transpose(resized, (2, 0, 1)).astype(np.uint8)


def providers(want: str):
  avail = ort.get_available_providers()
  if want == "cuda":
    if "CUDAExecutionProvider" in avail:
      return ["CUDAExecutionProvider", "CPUExecutionProvider"], "cuda"
    return ["CPUExecutionProvider"], "cpu(fallback-no-cuda)"
  return ["CPUExecutionProvider"], "cpu"


def session_opts(path: Path, prov, quant: str):
  so = ort.SessionOptions()
  if quant == "fp16" or path.suffix == ".ort":
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
  return ort.InferenceSession(str(path), sess_options=so, providers=prov)


def score_masks(masks: np.ndarray, scores: np.ndarray, gt: np.ndarray, thr=0.0, mode="letterbox"):
  # masks: [N,H,W] or [1,N,H,W] etc
  m = np.asarray(masks, dtype=np.float32)
  while m.ndim > 3:
    m = m.reshape(-1, m.shape[-2], m.shape[-1])
  if m.ndim == 2:
    m = m[None]
  sc = np.asarray(scores, dtype=np.float32).reshape(-1)
  n = min(len(sc), m.shape[0])
  Hgt, Wgt = gt.shape
  ious, areas = [], []
  for i in range(n):
    mi = m[i]
    up = mi if mi.shape == gt.shape else mask_to_image(mi, Hgt, Wgt, mode)
    areas.append(float((up > thr).mean()))
    ious.append(iou(up, gt, thr))
  best = int(np.argmax(sc[:n])) if n else -1
  return {
    "scores": [float(x) for x in sc[:n]],
    "ious": ious,
    "areas": areas,
    "best": best,
    "bestIou": ious[best] if best >= 0 else 0.0,
    "maxIou": max(ious) if ious else 0.0,
    "note": (
      "good✓"
      if (ious[best] if best >= 0 else 0) >= 0.5
      else "mid"
      if (ious[best] if best >= 0 else 0) >= 0.2
      else "bad✗"
    ),
  }


def run_model(meta: dict, img: np.ndarray, gt_info: dict, gt_mask: np.ndarray, prov, backend_name: str):
  mid = meta["id"]
  family = meta["family"]
  variant = meta.get("variant")
  enc_key = meta["encoderKey"]
  enc = MODELS_DIR / enc_key
  if not enc.exists():
    enc = MODELS_DIR / enc_key.replace(".ort", ".onnx")
  dec = MODELS_DIR / meta["decoderKey"]
  if not enc.exists() or not dec.exists():
    return {"id": mid, "backend": backend_name, "ok": False, "error": "missing files"}

  H, W = img.shape[:2]
  result = {
    "id": mid,
    "family": family,
    "variant": variant,
    "backend": backend_name,
    "ok": False,
    "prompts": {},
  }
  try:
    t0 = time.perf_counter()
    enc_s = session_opts(enc, prov, meta.get("quantization", "fp32"))
    dec_s = session_opts(dec, prov, meta.get("quantization", "fp32"))
    result["loadMs"] = (time.perf_counter() - t0) * 1000

    t1 = time.perf_counter()
    if family == "sam3" and variant == "visual":
      feeds_e = {"image": stretch_u8(img)}
      eout = enc_s.run(None, feeds_e)
      names = {o.name: i for i, o in enumerate(enc_s.get_outputs())}
      emb = {k: eout[names[k]] for k in names}
      scale = None
    elif family == "sam3":
      feeds_e = {"pixel_values": stretch_f32(img)}
      eout = enc_s.run(None, feeds_e)
      names = {o.name: i for i, o in enumerate(enc_s.get_outputs())}
      emb = {k: eout[names[k]] for k in names}
      scale = None
    else:
      tensor, scale = letterbox(img)
      in_name = "input_image" if family == "sam-hq" else "image"
      eout = enc_s.run(None, {in_name: tensor})
      names = {o.name: i for i, o in enumerate(enc_s.get_outputs())}
      emb = {k: eout[names[k]] for k in names}
    result["encodeMs"] = (time.perf_counter() - t1) * 1000

    prompts = {
      "box": ("box", gt_info["bbox"]),
      "pos_neg": (
        "points",
        [
          (gt_info["center"]["x"], gt_info["center"]["y"], 1),
          (gt_info["neg"]["x"], gt_info["neg"]["y"], 0),
        ],
      ),
      "pos_only": ("points", [(gt_info["center"]["x"], gt_info["center"]["y"], 1)]),
    }

    lang = None
    if family == "sam3" and variant == "visual":
      lang = {
        "mask": np.fromfile(MODELS_DIR / f"models/{mid}/v1/language_mask.bin", dtype=np.uint8),
        "feat": np.fromfile(
          MODELS_DIR / f"models/{mid}/v1/language_features.bin", dtype=np.float32
        ).reshape(32, 1, 256),
      }

    for pname, (ptype, payload) in prompts.items():
      try:
        t2 = time.perf_counter()
        scored = decode_one(
          family, variant, meta, dec_s, emb, scale, W, H, ptype, payload, gt_mask, lang
        )
        scored["ok"] = True
        scored["decodeMs"] = (time.perf_counter() - t2) * 1000
        result["prompts"][pname] = scored
      except Exception as e:  # noqa: BLE001 — report per-prompt
        result["prompts"][pname] = {"ok": False, "error": str(e)}

    result["ok"] = any(p.get("ok") for p in result["prompts"].values())
  except Exception as e:  # noqa: BLE001
    result["error"] = str(e)
  return result


def decode_one(family, variant, meta, dec_s, emb, scale, W, H, ptype, payload, gt_mask, lang):
  if family == "sam3" and variant == "visual":
    if ptype == "box":
      b = payload
      cx, cy = (b["x1"] + b["x2"]) / 2, (b["y1"] + b["y2"]) / 2
      bw, bh = b["x2"] - b["x1"], b["y2"] - b["y1"]
    else:
      pos = next(p for p in payload if p[2] == 1)
      cx, cy, bw, bh = pos[0], pos[1], 0.06, 0.06
    feeds = {
      "backbone_fpn_0": emb["backbone_fpn_0"],
      "backbone_fpn_1": emb["backbone_fpn_1"],
      "backbone_fpn_2": emb["backbone_fpn_2"],
      "vision_pos_enc_2": emb["vision_pos_enc_2"],
      "language_mask": lang["mask"].reshape(1, 32).astype(bool),
      "language_features": lang["feat"],
      "box_coords": np.array([[[cx, cy, bw, bh]]], dtype=np.float32),
      "box_labels": np.array([[1]], dtype=np.int64),
      "box_masks": np.array([[False]]),
    }
    outs = {o.name: v for o, v in zip(dec_s.get_outputs(), dec_s.run(None, feeds))}
    return score_masks(outs["masks"], outs["scores"], gt_mask, thr=0.5, mode="stretch")

  if family == "sam3":
    if ptype == "box":
      b = payload
      box = np.array(
        [[[b["x1"] * 1008, b["y1"] * 1008, b["x2"] * 1008, b["y2"] * 1008]]], dtype=np.float32
      )
      pts = np.zeros((1, 1, 0, 2), dtype=np.float32)
      labs = np.zeros((1, 1, 0), dtype=np.int64)
    else:
      pts = np.array([[[[p[0] * 1008, p[1] * 1008] for p in payload]]], dtype=np.float32)
      labs = np.array([[[p[2] for p in payload]]], dtype=np.int64)
      box = np.zeros((1, 0, 4), dtype=np.float32)
    feeds = {
      "input_points": pts,
      "input_labels": labs,
      "input_boxes": box,
      "image_embeddings.0": emb["image_embeddings.0"],
      "image_embeddings.1": emb["image_embeddings.1"],
      "image_embeddings.2": emb["image_embeddings.2"],
    }
    outs = {o.name: v for o, v in zip(dec_s.get_outputs(), dec_s.run(None, feeds))}
    sc = outs["iou_scores"].reshape(-1)[:3]
    return score_masks(
      outs["pred_masks"].reshape(-1, *outs["pred_masks"].shape[-2:]), sc, gt_mask, mode="stretch"
    )

  # build point coords in letterbox model space
  def to_xy(nx, ny):
    return [nx * W * scale, ny * H * scale]

  if ptype == "box":
    b = payload
    pts = np.array([[to_xy(b["x1"], b["y1"]), to_xy(b["x2"], b["y2"])]], dtype=np.float32)
    labs = np.array([[2.0, 3.0]], dtype=np.float32)
  else:
    pts = np.array([[to_xy(p[0], p[1]) for p in payload]], dtype=np.float32)
    labs = np.array([[float(p[2]) for p in payload]], dtype=np.float32)

  if family == "sam-hq":
    feeds = {
      "image_embeddings": emb["image_embeddings"],
      "interm_embeddings": emb["interm_embeddings"],
      "point_coords": pts,
      "point_labels": labs,
      "mask_input": np.zeros((1, 1, 256, 256), dtype=np.float32),
      "has_mask_input": np.array([0], dtype=np.float32),
      "orig_im_size": np.array([H, W], dtype=np.float32),
    }
    outs = {o.name: v for o, v in zip(dec_s.get_outputs(), dec_s.run(None, feeds))}
    return score_masks(outs["masks"], outs["iou_predictions"], gt_mask)

  if family == "edgesam":
    feeds = {
      "image_embeddings": emb["image_embeddings"],
      "point_coords": pts,
      "point_labels": labs,
    }
    outs = {o.name: v for o, v in zip(dec_s.get_outputs(), dec_s.run(None, feeds))}
    return score_masks(outs["masks"], outs["scores"], gt_mask)

  # sam2.1
  feeds = {
    "point_coords": pts,
    "point_labels": labs,
    "image_embed": emb["image_embed"],
    "high_res_feats_0": emb["high_res_feats_0"],
    "high_res_feats_1": emb["high_res_feats_1"],
    "mask_input": np.zeros((1, 1, 256, 256), dtype=np.float32),
    "has_mask_input": np.array([0], dtype=np.float32),
  }
  outs = {o.name: v for o, v in zip(dec_s.get_outputs(), dec_s.run(None, feeds))}
  sc = outs["iou_predictions"].reshape(-1)[:3]
  return score_masks(outs["masks"].reshape(-1, *outs["masks"].shape[-2:]), sc, gt_mask)


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument("--model", default=None)
  ap.add_argument("--provider", choices=["cuda", "cpu"], default="cuda")
  args = ap.parse_args()

  registry = json.loads(MODELS_JSON.read_text())
  models = [m for m in registry if "large" not in m["id"]]
  if args.model:
    models = [m for m in models if m["id"] == args.model]

  prov, backend_name = providers(args.provider)
  print(f"ORT {ort.__version__} providers_wanted={prov} backend={backend_name}")
  print("available:", ort.get_available_providers())

  img = np.array(Image.open(IMAGE).convert("RGB"))
  gt_info = parse_gt(GT_TXT.read_text())
  gt_mask = rasterize(gt_info["polygon"], img.shape[1], img.shape[0])
  print(
    f"gt area={gt_mask.mean()*100:.3f}% center=({gt_info['center']['x']:.3f},{gt_info['center']['y']:.3f})"
  )

  results = []
  for meta in models:
    print(f"\n→ {meta['id']} / {backend_name} …")
    r = run_model(meta, img, gt_info, gt_mask, prov, backend_name)
    results.append(r)
    if r.get("ok"):
      bits = []
      for k in ("box", "pos_neg", "pos_only"):
        p = r["prompts"].get(k, {})
        if p.get("ok"):
          bits.append(f"{k}:iou={p['bestIou']:.3f}{p.get('note','')}")
        else:
          bits.append(f"{k}:fail")
      print(f"  OK encode={r.get('encodeMs',0):.0f}ms | {' '.join(bits)}")
    else:
      print(f"  FAIL {r.get('error')}")

  stamp = time.strftime("%Y-%m-%dT%H-%M-%S")
  out = {"fixture": "test-image", "ort": ort.__version__, "results": results}
  path = OUT / f"harness-ort-{args.provider}-{stamp}.json"
  path.write_text(json.dumps(out, indent=2))
  (OUT / f"harness-ort-{args.provider}-latest.json").write_text(json.dumps(out, indent=2))

  print("\n| model | backend | box IoU | +/- IoU | + IoU | encode |")
  print("|---|---|---:|---:|---:|---:|")
  for r in results:
    def iou_cell(k):
      p = r.get("prompts", {}).get(k, {})
      if not p.get("ok"):
        return "-"
      return f"{p['bestIou']:.3f}"

    print(
      f"| {r['id']} | {r.get('backend','-')} | {iou_cell('box')} | {iou_cell('pos_neg')} | {iou_cell('pos_only')} | {r.get('encodeMs', float('nan')):.0f} |"
    )
  print("Wrote", path)


if __name__ == "__main__":
  main()
