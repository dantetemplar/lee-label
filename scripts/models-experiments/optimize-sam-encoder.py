#!/usr/bin/env python3
"""
Re-optimize SAM encoder ONNX with ORT transformer fusion (MultiHeadAttention),
optionally convert to fp16, then pack to .ort for WebGPU.

Tiny-first workflow:
  python3 scripts/models-experiments/optimize-sam-encoder.py --models sam2.1-tiny
  python3 scripts/models-experiments/optimize-sam-encoder.py --models sam2.1-tiny --float16
  python3 scripts/models-experiments/optimize-sam-encoder.py --models sam2.1-tiny --install

Output lands in scripts/models-experiments/optimize-out/<model-id>/v1/{encoder.ort,decoder.onnx,report.json}
With --install, also copies into ~/.config/Lee Label/websam-models-opt/models/...
With --install-app, installs into ~/.config/Lee Label/Models/models/...
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from urllib.request import urlretrieve

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT_ROOT = HERE / "optimize-out"
CACHE_ROOT = HERE / "cache"
DEFAULT_INSTALL = Path.home() / ".config" / "Lee Label" / "websam-models-opt"

# Upstream sources (encoder ONNX). Decoders copied from app cache when present.
# Tiny variants stay fp32 in the app; bigger ones use --float16 --no-fuse.
SOURCES: dict[str, dict] = {
    "sam2.1-tiny": {
        "family": "sam2.1",
        "model_type": "sam2",
        "zip_url": "https://huggingface.co/vietanhdev/segment-anything-2.1-onnx-models/resolve/main/sam2.1_hiera_tiny_20260221.zip",
        "encoder_zip": "sam2.1_hiera_tiny.encoder.onnx",
        "decoder_zip": "sam2.1_hiera_tiny.decoder.onnx",
        "cache_id": "sam2.1-tiny",
    },
    "sam2.1-small": {
        "family": "sam2.1",
        "model_type": "sam2",
        "zip_url": "https://huggingface.co/vietanhdev/segment-anything-2.1-onnx-models/resolve/main/sam2.1_hiera_small_20260221.zip",
        "encoder_zip": "sam2.1_hiera_small.encoder.onnx",
        "decoder_zip": "sam2.1_hiera_small.decoder.onnx",
        "cache_id": "sam2.1-small",
    },
    "sam2.1-baseplus": {
        "family": "sam2.1",
        "model_type": "sam2",
        "zip_url": "https://huggingface.co/vietanhdev/segment-anything-2.1-onnx-models/resolve/main/sam2.1_hiera_base_plus_20260221.zip",
        "encoder_zip": "sam2.1_hiera_base_plus.encoder.onnx",
        "decoder_zip": "sam2.1_hiera_base_plus.decoder.onnx",
        "cache_id": "sam2.1-baseplus",
    },
    "sam2.1-large": {
        "family": "sam2.1",
        "model_type": "sam2",
        "zip_url": "https://huggingface.co/vietanhdev/segment-anything-2.1-onnx-models/resolve/main/sam2.1_hiera_large_20260221.zip",
        "encoder_zip": "sam2.1_hiera_large.encoder.onnx",
        "decoder_zip": "sam2.1_hiera_large.decoder.onnx",
        "cache_id": "sam2.1-large",
    },
    "sam-hq-tiny": {
        "family": "sam-hq",
        "model_type": "vit",
        "num_heads": 5,
        "hidden_size": 160,
        "local_encoder_candidates": [
            ROOT / ".tmp" / "sam-hq-export" / "sam-hq-tiny-encoder.onnx",
            Path("/tmp/sam-hq-export/sam-hq-tiny-encoder.onnx"),
            ROOT / "sam-hq-tiny-encoder.onnx",
        ],
        "cache_id": "sam-hq-tiny",
    },
    "sam-hq-base": {
        "family": "sam-hq",
        "model_type": "vit",
        "num_heads": 12,
        "hidden_size": 768,
        "local_encoder_candidates": [
            ROOT / ".tmp" / "sam-hq-export" / "sam-hq-base-encoder.onnx",
            Path("/tmp/sam-hq-export/sam-hq-base-encoder.onnx"),
            ROOT / "sam-hq-base-encoder.onnx",
        ],
        "cache_id": "sam-hq-base",
    },
    "sam-hq-large": {
        "family": "sam-hq",
        "model_type": "vit",
        "num_heads": 16,
        "hidden_size": 1024,
        "local_encoder_candidates": [
            ROOT / ".tmp" / "sam-hq-export" / "sam-hq-large-encoder.onnx",
            Path("/tmp/sam-hq-export/sam-hq-large-encoder.onnx"),
            ROOT / "sam-hq-large-encoder.onnx",
        ],
        "cache_id": "sam-hq-large",
    },
}

# Bigger WebGPU models → fp16 encoders. Tinies / EdgeSAM / SlimSAM stay as-is.
FP16_MODEL_IDS = [
    "sam2.1-small",
    "sam2.1-baseplus",
    "sam2.1-large",
    "sam-hq-base",
    "sam-hq-large",
]

APP_CACHE = Path.home() / ".config" / "Lee Label" / "Models"


def op_counts(onnx_path: Path) -> dict[str, int]:
    import onnx

    model = onnx.load(str(onnx_path), load_external_data=False)
    counts: dict[str, int] = {}
    for node in model.graph.node:
        counts[node.op_type] = counts.get(node.op_type, 0) + 1
    interesting = [
        "Softmax",
        "MatMul",
        "MultiHeadAttention",
        "Attention",
        "LayerNormalization",
        "SkipLayerNormalization",
        "GroupQueryAttention",
    ]
    return {k: counts.get(k, 0) for k in interesting} | {"_nodes": len(model.graph.node)}


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  cached: {dest}")
        return
    print(f"  download: {url}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    urlretrieve(url, tmp)
    tmp.rename(dest)


def resolve_encoder_decoder(model_id: str, work: Path) -> tuple[Path, Path | None]:
    spec = SOURCES[model_id]
    enc = work / "encoder.src.onnx"
    dec: Path | None = None
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)

    if "zip_url" in spec:
        zpath = CACHE_ROOT / f"{model_id}.zip"
        download(spec["zip_url"], zpath)
        with zipfile.ZipFile(zpath) as zf:
            enc.write_bytes(zf.read(spec["encoder_zip"]))
            if "decoder_zip" in spec:
                dec = work / "decoder.onnx"
                dec.write_bytes(zf.read(spec["decoder_zip"]))
        return enc, dec

    if "encoder_url" in spec:
        enc_cache = CACHE_ROOT / f"{model_id}.encoder.onnx"
        download(spec["encoder_url"], enc_cache)
        shutil.copy2(enc_cache, enc)
        if "decoder_url" in spec:
            dec_cache = CACHE_ROOT / f"{model_id}.decoder.onnx"
            download(spec["decoder_url"], dec_cache)
            dec = work / "decoder.onnx"
            shutil.copy2(dec_cache, dec)
        return enc, dec

    for cand in spec.get("local_encoder_candidates", []):
        if Path(cand).exists():
            shutil.copy2(cand, enc)
            cache_dec = APP_CACHE / "models" / spec["cache_id"] / "v1" / "decoder.onnx"
            if cache_dec.exists():
                dec = work / "decoder.onnx"
                shutil.copy2(cache_dec, dec)
            return enc, dec

    raise FileNotFoundError(
        f"{model_id}: no encoder ONNX. For SAM-HQ run scripts/models-experiments/export-sam-hq.sh tiny first "
        f"(looks in .tmp/sam-hq-export/ or /tmp/sam-hq-export/)."
    )


def sanitize_fp16_resize_range(onnx_path: Path) -> None:
    """
    ORT convert_float_to_float16 often leaves Resize.scales / Range bounds as fp16,
    which ORT rejects (scales must be float32). Fix by Cast around those ops while
    restoring Range outputs to fp16 so downstream Adds stay homogeneous.
    See: https://github.com/microsoft/onnxruntime/issues/14827
    """
    import onnx
    from onnx import helper, TensorProto

    model = onnx.load(str(onnx_path), load_external_data=False)
    new_nodes: list = []
    cast_i = 0

    def make_cast(inp: str, to_type: int, tag: str):
        nonlocal cast_i
        out = f"{inp}__{tag}_{cast_i}"
        node = helper.make_node("Cast", [inp], [out], to=to_type, name=f"Cast_{tag}_{cast_i}")
        cast_i += 1
        return out, node

    for node in model.graph.node:
        if node.op_type == "Resize" and len(node.input) > 2 and node.input[2]:
            new_in, cnode = make_cast(node.input[2], TensorProto.FLOAT, "rz_sc")
            new_nodes.append(cnode)
            node.input[2] = new_in
            new_nodes.append(node)
        elif node.op_type == "Range":
            old_out = node.output[0]
            for i in range(min(3, len(node.input))):
                if node.input[i]:
                    new_in, cnode = make_cast(node.input[i], TensorProto.FLOAT, "rg_in")
                    new_nodes.append(cnode)
                    node.input[i] = new_in
            f32_out = f"{old_out}__f32"
            node.output[0] = f32_out
            new_nodes.append(node)
            new_nodes.append(
                helper.make_node(
                    "Cast",
                    [f32_out],
                    [old_out],
                    to=TensorProto.FLOAT16,
                    name=f"Cast_rg_out_{cast_i}",
                )
            )
            cast_i += 1
        else:
            new_nodes.append(node)

    while len(model.graph.node):
        model.graph.node.pop()
    model.graph.node.extend(new_nodes)
    onnx.save(model, str(onnx_path))


def validate_onnx(path: Path) -> None:
    import onnxruntime as ort

    ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])


def _finalize_fp16(dst: Path) -> None:
    print("  sanitize fp16 Resize/Range…")
    sanitize_fp16_resize_range(dst)
    import onnx

    model = onnx.load(str(dst), load_external_data=False)
    if model.graph.value_info:
        while len(model.graph.value_info):
            model.graph.value_info.pop()
        onnx.save(model, str(dst))
    validate_onnx(dst)
    print("  fp16 graph validates on CPU EP")


def optimize_onnx(
    src: Path,
    dst: Path,
    *,
    model_type: str,
    float16: bool,
    use_gpu: bool,
    fuse: bool,
    num_heads: int | None,
    hidden_size: int | None,
) -> dict:
    dst.parent.mkdir(parents=True, exist_ok=True)

    if not fuse:
        # fp16-only: keep MatMul+Softmax graph (MHA fusion regresses WebGPU on NVIDIA).
        print(f"  fp16-only (no fusion) float16={float16}")
        if not float16:
            shutil.copy2(src, dst)
        else:
            import onnx
            from onnxruntime.transformers.float16 import convert_float_to_float16

            model = onnx.load(str(src), load_external_data=False)
            model = convert_float_to_float16(model, keep_io_types=True)
            onnx.save(model, str(dst))
            _finalize_fp16(dst)
        report = {
            "before": op_counts(src),
            "after": op_counts(dst),
            "model_type": model_type,
            "float16": float16,
            "use_gpu": use_gpu,
            "fuse": False,
            "opt_level": None,
        }
        print(f"  ops before: {report['before']}")
        print(f"  ops after:  {report['after']}")
        return report

    from onnxruntime.transformers import optimizer
    from onnxruntime.transformers.fusion_options import FusionOptions

    # opt_level=1 runs ORT first and can break SAM2 Softmax patterns so MHA never
    # fuses. opt_level=0 keeps the graph layout the sam2 fuser expects.
    # use_gpu + use_multi_head_attention → com.microsoft::MultiHeadAttention (FA path).
    fusion_opts = FusionOptions(model_type)
    fusion_opts.use_multi_head_attention = True

    kwargs: dict = {
        "input": str(src),
        "model_type": model_type,
        "opt_level": 0,
        "use_gpu": use_gpu,
        "only_onnxruntime": False,
        "verbose": False,
        "optimization_options": fusion_opts,
    }
    if num_heads:
        kwargs["num_heads"] = num_heads
    if hidden_size:
        kwargs["hidden_size"] = hidden_size

    print(f"  optimize model_type={model_type} float16={float16} use_gpu={use_gpu} opt_level=0 mha=1")
    opt = optimizer.optimize_model(**kwargs)
    if float16:
        # Default conversion; sanitize Resize/Range afterward (blocking Resize breaks Adds).
        opt.convert_float_to_float16(keep_io_types=True)

    opt.save_model_to_file(str(dst), use_external_data_format=False)

    if float16:
        _finalize_fp16(dst)

    report = {
        "before": op_counts(src),
        "after": op_counts(dst),
        "model_type": model_type,
        "float16": float16,
        "use_gpu": use_gpu,
        "fuse": True,
        "opt_level": 0,
    }
    print(f"  ops before: {report['before']}")
    print(f"  ops after:  {report['after']}")
    return report


def convert_to_ort(onnx_path: Path, ort_path: Path) -> Path:
    """Convert to .ort; on failure keep .onnx (returned path)."""
    cmd = [
        sys.executable,
        "-m",
        "onnxruntime.tools.convert_onnx_models_to_ort",
        str(onnx_path),
        "--optimization_style",
        "Runtime",
    ]
    print(f"  ort convert: {' '.join(cmd)}")
    try:
        subprocess.check_call(cmd)
    except subprocess.CalledProcessError as err:
        fallback = ort_path.with_suffix(".onnx")
        print(f"  WARN: ORT convert failed ({err}); keeping {fallback.name}")
        shutil.copy2(onnx_path, fallback)
        return fallback

    produced = onnx_path.with_name(onnx_path.stem + ".with_runtime_opt.ort")
    if not produced.exists():
        alt = list(onnx_path.parent.glob(onnx_path.stem + "*.ort"))
        if not alt:
            fallback = ort_path.with_suffix(".onnx")
            shutil.copy2(onnx_path, fallback)
            return fallback
        produced = alt[0]
    ort_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(produced), str(ort_path))
    return ort_path


def process_model(model_id: str, args: argparse.Namespace) -> dict:
    spec = SOURCES[model_id]
    out_dir = OUT_ROOT / model_id / "v1"
    out_dir.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix=f"opt-{model_id}-"))
    report: dict = {"id": model_id}

    try:
        enc_src, dec = resolve_encoder_decoder(model_id, work)
        report["encoder_src_bytes"] = enc_src.stat().st_size

        fused = work / "encoder.fused.onnx"
        fusion = optimize_onnx(
            enc_src,
            fused,
            model_type=spec["model_type"],
            float16=args.float16,
            use_gpu=args.use_gpu,
            fuse=args.fuse,
            num_heads=spec.get("num_heads"),
            hidden_size=spec.get("hidden_size"),
        )
        report["fusion"] = fusion

        mha = fusion["after"].get("MultiHeadAttention", 0) + fusion["after"].get("Attention", 0)
        if args.fuse and mha == 0:
            print(f"  WARN: no Attention/MultiHeadAttention fused for {model_id}")

        ort_out = out_dir / "encoder.ort"
        # fp16 .ort packing fails (external data / shape merge); keep .onnx.
        if args.float16:
            enc_final = out_dir / "encoder.onnx"
            shutil.copy2(fused, enc_final)
            print(f"  keep fp16 as {enc_final.name} (skip .ort)")
        else:
            enc_final = convert_to_ort(fused, ort_out)
        report["encoder_file"] = enc_final.name
        report["encoder_bytes"] = enc_final.stat().st_size

        # Decoder: prefer freshly downloaded, else app cache
        dec_out = out_dir / "decoder.onnx"
        if dec and dec.exists():
            shutil.copy2(dec, dec_out)
        else:
            cache_dec = APP_CACHE / "models" / spec["cache_id"] / "v1" / "decoder.onnx"
            if cache_dec.exists():
                shutil.copy2(cache_dec, dec_out)
            else:
                raise FileNotFoundError(f"No decoder for {model_id}")

        # Ensure encoder is named as expected by registry when ORT succeeded,
        # or write a models override note when we kept .onnx.
        if enc_final.suffix == ".onnx" and enc_final.name != "encoder.onnx":
            target = out_dir / "encoder.onnx"
            shutil.move(str(enc_final), str(target))
            enc_final = target
            report["encoder_file"] = enc_final.name

        report_path = out_dir / "report.json"
        report_path.write_text(json.dumps(report, indent=2) + "\n")
        print(f"  wrote {out_dir} ({enc_final.name})")

        install_dirs: list[Path] = []
        if args.install:
            install_dirs.append(Path(args.install_dir))
        if args.install_app:
            install_dirs.append(APP_CACHE)

        for install_root in install_dirs:
            dest = install_root / "models" / model_id / "v1"
            dest.mkdir(parents=True, exist_ok=True)
            for stale in dest.glob("encoder.*"):
                stale.unlink()
            shutil.copy2(enc_final, dest / enc_final.name)
            shutil.copy2(dec_out, dest / "decoder.onnx")
            shutil.copy2(report_path, dest / "report.json")
            print(f"  installed → {dest}")

        return report
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--models",
        nargs="+",
        default=None,
        choices=list(SOURCES.keys()),
        help="Model ids (default with --float16 --no-fuse: all bigger models)",
    )
    p.add_argument("--float16", action="store_true", help="Convert encoder to fp16")
    p.add_argument(
        "--fuse",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Run MHA attention fusion (default: on; use --no-fuse for fp16-only)",
    )
    p.add_argument(
        "--use-gpu",
        action="store_true",
        default=True,
        help="Enable GPU-oriented MultiHeadAttention fusion (default: on)",
    )
    p.add_argument("--no-use-gpu", action="store_false", dest="use_gpu")
    p.add_argument("--install", action="store_true", help="Copy into --install-dir cache")
    p.add_argument(
        "--install-app",
        action="store_true",
        help=f"Install into app cache ({APP_CACHE})",
    )
    p.add_argument("--install-dir", default=str(DEFAULT_INSTALL))
    # pnpm run … -- --models … forwards a literal "--"
    argv = [a for a in sys.argv[1:] if a != "--"]
    args = p.parse_args(argv)

    if args.models is None:
        if args.float16 and not args.fuse:
            args.models = list(FP16_MODEL_IDS)
        else:
            args.models = ["sam2.1-tiny"]

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    results = []
    for mid in args.models:
        print(f"\n=== {mid} ===")
        try:
            results.append(process_model(mid, args))
        except Exception as err:
            print(f"  FAIL: {err}")
            results.append({"id": mid, "error": str(err)})

    summary = OUT_ROOT / "summary.json"
    summary.write_text(json.dumps(results, indent=2) + "\n")
    print(f"\nSummary: {summary}")
    failed = [r for r in results if r.get("error")]
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
