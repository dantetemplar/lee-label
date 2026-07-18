# Magick Stick model experiments

Offline tools and notes for SAM encoder convert / WebGPU bench on Lee Label (ORT WebGPU, Electron Dawn).

Layout:

| Path                      | Role                                             |
| ------------------------- | ------------------------------------------------ |
| `optimize-sam-encoder.py` | Fuse / fp16 / install into app cache             |
| `export-sam-hq.sh`        | Export HQ ONNX (keeps `*-encoder.onnx` for fp16) |
| `cache/`                  | Downloaded upstream ONNX/zips                    |
| `optimize-out/`           | Local convert outputs                            |
| `bench/`                  | Electron WebGPU harness + SAM3 probe             |

Never force `--ozone-platform=x11` — use the native ozone (Wayland on this machine).

---

## TL;DR

| Do                                            | Don’t                                                 |
| --------------------------------------------- | ----------------------------------------------------- |
| WebGPU EP: `preferredLayout: 'NCHW'`          | Rely on default layout (NHWC-ish → wrong masks)       |
| `--float16 --no-fuse` for bigger models       | MHA fusion for WebGPU on NVIDIA (slower, no VRAM win) |
| Enable Dawn `vulkan_enable_f16_on_nvidia`     | Ship fp16 without `shader-f16`                        |
| Keep tinies **fp32**; decoder always **fp32** | Convert Resize scales / Range to fp16                 |
| Use disk `TMPDIR` (`$PWD/.tmp`)               | Fill `/tmp` tmpfs on large converts                   |

App already sets:

```ts
app.commandLine.appendSwitch('enable-dawn-features', 'vulkan_enable_f16_on_nvidia')
// session.ts — required for correct SAM2 / SAM3 WebGPU decode
{ name: 'webgpu', preferredLayout: 'NCHW' }
```

## Policy (shipped `v0.1.0`)

| Models                                | Encoder                                 |
| ------------------------------------- | --------------------------------------- |
| `*-tiny`, EdgeSAM, SlimSAM            | **F32** (or INT8) — stock               |
| small / base+ / large / HQ base+large | **F16** encoder only; decoder stays F32 |

Registry: `quantization: 'fp16'`, `encoderKey: …/encoder.onnx` for F16. Cache: `~/.config/Lee Label/Models/`.

---

## Optimize / convert

```bash
export TMPDIR="$PWD/.tmp"

# Bigger models → fp16, install into app cache
pnpm optimize:sam -- --float16 --no-fuse --install-app

# Single model
pnpm optimize:sam -- --float16 --no-fuse --install-app --models sam2.1-small

# SAM-HQ needs a local ONNX export first:
WORKDIR="$PWD/.tmp/sam-hq-export" scripts/models-experiments/export-sam-hq.sh base
pnpm optimize:sam -- --float16 --no-fuse --install-app --models sam-hq-base

# Optional staging dir
pnpm optimize:sam -- --float16 --no-fuse --install \
  --install-dir="$HOME/.config/Lee Label/websam-models-opt"
```

Default with `--float16 --no-fuse` (no `--models`): `FP16_MODEL_IDS` (SAM 2.1 small/base+/large, HQ base/large).

### Pipeline (`--float16 --no-fuse`)

1. Load upstream ONNX (HF SAM 2.1 zips, or local HQ export).
2. `convert_float_to_float16(keep_io_types=True)` — **no** attention fusion.
3. Sanitize Resize/Range ([ORT #14827](https://github.com/microsoft/onnxruntime/issues/14827)): Cast Resize.scales → f32; Range in f32 then Cast outs back to f16; clear stale `value_info`.
4. Validate on CPU EP; keep **`.onnx`** (`.ort` pack fails on these fp16 graphs).
5. `--install-app` → `~/.config/Lee Label/Models/models/<id>/v1/{encoder.onnx,decoder.onnx}`.

### Fusion experiments (do not ship)

```bash
pnpm optimize:sam -- --models sam2.1-tiny --install
```

| Step                                           | Result                                                |
| ---------------------------------------------- | ----------------------------------------------------- |
| `opt_level=0` + MHA + `use_gpu` on sam2.1-tiny | Softmax 12→0, MHA 0→12                                |
| Same fused fp32 on WebGPU                      | Encode **slower** (~840→1300 ms), VRAM same/worse     |
| Naive fp16 / fused+fp16 without sanitize       | Invalid Resize/Range; WebGPU rejects or breaks on Add |
| Fused + sanitized fp16                         | Works with Dawn toggle, slower than **fp16 no-fuse**  |

ORT WebGPU FlashAttention is LLM-oriented; SAM Softmax→MHA did not cut peak VRAM.

---

## Bench (WebGPU)

Isolated Electron harness: encode + segment a synthetic image (blue field + red circle, click center); timings + `nvidia-smi` VRAM. Each model = **fresh Electron process**.

```bash
pnpm bench:sam
pnpm bench:sam -- --model=sam2.1-tiny
pnpm bench:sam:compare
pnpm bench:sam -- --models-dir=/path/to/cache
pnpm bench:sam -- --model=sam2.1-large --timeout=300000
```

| Variant         | What it tests                                                            |
| --------------- | ------------------------------------------------------------------------ |
| `baseline`      | App defaults (`.ort` / fp16 `.onnx`: `graphOptimizationLevel: disabled`) |
| `gpu-io`        | `preferredOutputLocation: 'gpu-buffer'`                                  |
| `graph-capture` | `enableGraphCapture: true`                                               |
| `opt-all`       | `graphOptimizationLevel: 'all'` on encoder + decoder                     |

Session-option variants alone did **not** fix OOMs or cut peak VRAM on GTX 1650.

**Pass:** encode+decode OK, click inside mask (logit > 0), ≥50% red-circle coverage.

JSON under `bench/out/bench-<variant>-latest.json`. `models.json` regenerated from `src/shared/websam-models.ts` via `bench/sync-models.mjs`.

---

## Findings (GTX 1650 4GB, Electron 43 / Dawn, 2026-07-15)

### Baseline stock fp32 (pre-fp16)

| Model               | Result                          | Encode  | Peak VRAM    |
| ------------------- | ------------------------------- | ------- | ------------ |
| Light HQ-SAM (tiny) | pass                            | fast    | ≤~1 GB class |
| SAM 2.1 Tiny        | pass                            | ~840 ms | ~2.5 GB      |
| SAM 2.1 Small       | often quality fail on synthetic | ~1.0 s  | ~2.6 GB      |
| SAM 2.1 Base+       | **OOM**                         | —       | ~3.7 GB      |
| HQ-SAM ViT-B        | **OOM**                         | —       | ~3.7 GB      |
| EdgeSAM             | pass (WASM)                     | —       | n/a          |

Stock SAM 2 family dropped from the app; only **SAM 2.1** + HQ + lightweight remain.

### `shader-f16` / Dawn on NVIDIA Vulkan

- Without toggle: **no** `shader-f16` → fp16 encode fails (`Add` / missing f16).
- With `--enable-dawn-features=vulkan_enable_f16_on_nvidia` (before `app.ready`): **present**.
- Toggle is Dawn-only; Chromium defaults off on NVIDIA Vulkan ([tint#2164](https://crbug.com/tint/2164)).

### fp16 encoders (no fuse), decoder fp32

| Model           | Variant           | Quality       | Encode        | Peak VRAM |
| --------------- | ----------------- | ------------- | ------------- | --------- |
| sam2.1-tiny     | stock fp32 (kept) | pass          | ~840 ms       | ~2.5 GB   |
| sam2.1-tiny     | fp16 no-fuse      | pass          | ~1120 ms      | ~1.5 GB   |
| sam2.1-tiny     | fused fp32        | pass          | ~1300 ms      | ~2.7 GB   |
| sam2.1-tiny     | fused+fp16        | pass          | ~1450 ms      | ~1.5 GB   |
| sam2.1-small    | stock fp32        | quality fail* | ~1030 ms      | ~2.6 GB   |
| sam2.1-small    | fp16 no-fuse      | **pass**      | ~1270–1350 ms | ~1.5 GB   |
| sam2.1-baseplus | stock fp32        | **OOM**       | —             | ~3.7 GB   |
| sam2.1-baseplus | fp16 no-fuse      | **pass**      | ~2.0–2.2 s    | ~2.1 GB   |
| sam-hq-base     | fp16 no-fuse      | pass          | ~2.7 s        | ~2.3 GB   |

\*Synthetic circle; stock small often empty mask; fp16 passed with high coverage.

**Tradeoff:** ~1.3× encode vs stock tiny for fp16-only; ~40% less peak VRAM; unlocks Base+ / HQ-B on 4 GB.

### Why tiny is slower under fp16

1. Most regression from **MHA fusion** when used (~+465 ms).
2. Remaining (~+150–280 ms): Turing weak WebGPU f16 throughput; ~100+ Cast nodes from `keep_io_types` + sanitization. Tiny already fits — fp16 buys memory, not speed.

### App notes validated by bench

- Dawn f16 toggle before `app.ready`.
- fp16 `.onnx` needs `graphOptimizationLevel: 'disabled'` (same as `.ort`).
- Encode preload must be **deduped** (concurrent `ensureSamEncoded` used to run 2–3×).
- WebGPU sessions must set `preferredLayout: 'NCHW'` (see correctness section below).

---

## GT prompt harness (correctness)

Fixture: repo-root `test-image.png` + YOLO poly `test-image.txt` (PCB capacitor). Prompts: GT bbox; +center/−outside; +only. IoU vs rasterized GT mask.

```bash
# All non-large models × WebGPU (fresh Electron per model)
node scripts/models-experiments/bench/harness-all.mjs --backend=webgpu

# One model
node scripts/models-experiments/bench/harness-all.mjs --model=sam2.1-tiny --backend=webgpu

# Also: wasm, or Python CUDA via harness-ort.sh (see bench/)
```

JSON under `bench/out/harness-*.json`. Skip `*large*`.

### WebGPU layout bug (fixed 2026-07-16)

ORT WebGPU’s **default layout path** (behaves like NHWC) corrupts decode on NVIDIA/Electron Dawn. Symptoms on GTX 1650:

| Symptom                                                                      | Models                              |
| ---------------------------------------------------------------------------- | ----------------------------------- |
| First **box** decode (labels `2`/`3`) → IoU ~0.03–0.35; 2nd identical box OK | SAM 2.1 tiny / small (base+ milder) |
| **Point** prompts → IoU ~0.006 (wrong multimask ranking)                     | SAM 3 Tracker                       |
| WASM / CUDA / explicit **NCHW**                                              | correct                             |

**Fix (shipped in app):**

```ts
executionProviders: [{ name: 'webgpu', preferredLayout: 'NCHW' }]
```

| Model           | Before (box / ± / +)                 | After NCHW                                            |
| --------------- | ------------------------------------ | ----------------------------------------------------- |
| sam-hq-tiny     | 0.95 / 0.97 / 0.96                   | same ✓                                                |
| sam-hq-base     | 0.94 / 0.84 / 0.71                   | same ✓                                                |
| sam2.1-tiny     | **0.25** / 0.82 / 0.81               | **0.85** / 0.81 / 0.82 ✓                              |
| sam2.1-small    | **0.35** / 0.82 / 0.84               | **0.83** / 0.82 / 0.84 ✓                              |
| sam2.1-baseplus | 0.71 / 0.83 / 0.83                   | **0.80** / 0.83 / 0.83 ✓                              |
| sam3-tracker    | 0.84 / **0.006** / **0.006**         | 0.84 / **0.83** / **0.84** ✓                          |
| edgesam         | 0.85 / 0.67 / **0.007** (raw scores) | stability + area prior → **0.85** / 0.67 / **0.85** ✓ |

Diag: `bench/harness-sam2-box.mjs` (cold box vs 2nd box vs variants).

### Dead ends (do not chase)

| Attempt                                       | Result                                              |
| --------------------------------------------- | --------------------------------------------------- |
| Pad box with label `-1`                       | Red herring — only looked fixed as the _2nd_ decode |
| Discard-first-box warmup                      | Works but masks the EP bug; removed after NCHW      |
| Force ScatterND → CPU (`forceCpuNodeNames`)   | No change                                           |
| Rewrite / re-export decoder without ScatterND | WebGPU worse; stock decoder restored                |
| `onnxruntime-web@1.27.0` bump alone           | Already latest; not sufficient without NCHW         |
| `freeDimensionOverrides` lock `num_points=2`  | Fixes cold box but breaks variable-length prompts   |

Related ORT context: layout-sensitive ops ([#22994](https://github.com/microsoft/onnxruntime/issues/22994)); JS EP historically defaults toward NHWC while docs mention NCHW — **set NCHW explicitly**.

---

## SAM 3 Tracker (exploratory)

Upstream [onnx-community/sam3-tracker-ONNX](https://huggingface.co/onnx-community/sam3-tracker-ONNX) already ships F16 enc + F32 dec:

| File                                                     | Role                 | Size    |
| -------------------------------------------------------- | -------------------- | ------- |
| `onnx/vision_encoder_fp16.onnx` (+ `.onnx_data`)         | F16 weights, F32 I/O | ~936 MB |
| `onnx/prompt_encoder_mask_decoder.onnx` (+ `.onnx_data`) | F32 decoder          | ~22 MB  |

Also: `vision_encoder_q4f16` / `q4` / `int8` (smaller).

**Not SAM2.1-shaped** — needs a new Magick Stick family:

|              | SAM 2.1                    | SAM 3 Tracker                              |
| ------------ | -------------------------- | ------------------------------------------ |
| Size         | 1024 letterbox             | **1008** square                            |
| Encoder outs | `image_embed` + 2 high-res | **3** `image_embeddings.{0,1,2}`           |
| Decoder      | separate                   | fused `prompt_encoder_mask_decoder`        |
| Weights      | single `.onnx` / `.ort`    | external `.onnx_data` (inline for ORT Web) |

```bash
# After download + inline under .tmp/sam3-tracker/inlined/
pnpm probe:sam3

# Package release zip / install into app cache for local dev
scripts/models-experiments/package-sam3.sh
scripts/models-experiments/install-sam3-local.sh
```

**WebGPU F16+F32** (GTX 1650): encode ~9 s, peak ~3.6 GB (tight). Requires `preferredLayout: 'NCHW'` — without it, box prompts look fine but **point** IoUs collapse (~0.006). `q4f16` still useful for headroom.

Transformers.js pattern: `dtype: { vision_encoder: "fp16", prompt_encoder_mask_decoder: "fp32" }`, `device: "webgpu"`.

---

## PicoSAM3 (ROI-crop, box-only)

[pietrobonazzi/picosam3](https://huggingface.co/pietrobonazzi/picosam3) — ~5.2 MB fp32 ONNX distilled from SAM3 for Sony IMX500. **Not** a Magick Stick drop-in: no point prompts, no image embedding cache.

|        | Magick Stick SAM*        | PicoSAM3                                  |
| ------ | ------------------------ | ----------------------------------------- |
| Prompt | points / box tensors     | **bbox → square crop → 96×96** (implicit) |
| Input  | full letterbox 1024/1008 | `float32[1,3,96,96]` ImageNet-norm        |
| Output | multimask + scores       | single `mask` logits `[1,1,96,96]`        |
| Size   | tens–hundreds MB         | **~5 MB**                                 |

```bash
# ONNX cached at scripts/models-experiments/cache/picosam3/
curl -L -o scripts/models-experiments/cache/picosam3/PicoSAM3_SAM3_student_best.onnx \
  https://huggingface.co/pietrobonazzi/picosam3/resolve/main/PicoSAM3_SAM3_student_best.onnx

./node_modules/.bin/electron scripts/models-experiments/bench/probe-picosam3.mjs --backend=wasm
./node_modules/.bin/electron scripts/models-experiments/bench/probe-picosam3.mjs --backend=webgpu
```

**GT fixture (capacitor box, 2026-07-16):** IoU **0.92** on CPU ORT / WASM / WebGPU (NCHW). WASM infer ~80 ms; WebGPU ~390 ms (tiny CNN — CPU/WASM wins).

App wiring would be: Magick Stick **box tool only** → `pad_bbox_to_square(+10%)` → resize 96 → sigmoid → upsample mask into ROI. Points unsupported without a fake box around the click.

---

## Exemplar Prompts — findings & removal (2026-07-18)

**Status: removed from the app.** One-box → all-similar-instances (PCS) was not good enough for PCB labeling. Keeping notes so we don't re-litigate the same backends.

### Goal

Draw one exemplar bbox → return masks for every similar instance on the image (Promptable Concept Segmentation), not SAM3-tracker PVS (single tracked object).

UI was **Exemplar Prompts** (`~4`): draw box → dashed multi-mask preview → Enter commit / Esc cancel.

### Verdict (why it was removed)

On real PCB work (ICs, LEDs, tiny passives) every backend failed the bar:

| Backend                             | Bench (`test-image` capacitors)              | Real PCB use                                                                                                           |
| ----------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Full SAM3 PCS (PyTorch CPU)         | Best: prompt IoU ~0.97, many siblings        | Slow (~18s load, ~24s first encode, ~4–5s decode on CPU). Quality OK on capacitors; still weak/noisy on tiny LEDs/ICs. |
| SAM3.cpp Q4_0 CPU                   | Smoke: 69 instances, encode ~55s, decode ~7s | **Too many false positives**, low-confidence clutter (~0.43–0.51 top scores). Feels unusable as a labeling aid.        |
| SAM3.cpp F16                        | Same API, larger/slower                      | Same PCS semantics; not worth the wait given Q4 quality.                                                               |
| EfficientSAM3 EV-M (PyTorch / ONNX) | Capacitors IoU ~0.76–0.88                    | Tiny LEDs: low recall / shifted masks. Upsampling all 200 queries OOMs on 4GB; must upsample selected only.            |
| YOLOE-11S/M/L visual prompt         | 11M@1280 better recall than 11S@640          | Still misses siblings / adds junk on dense boards. Dynamic prompts need Ultralytics Python — cannot bake into ONNX.    |
| Full SAM3 PCS WebGPU @1008²         | —                                            | **OOM** on GTX 1650 4GB (~3.2 GB Softmax). CPU encode + WebGPU decode was workable (~0.89 IoU) but not productized.    |

**Bottom line:** capacitor smoke tests overstate quality. For dense PCB parts the feature wasted time (slow CPU encode) and produced noisy multi-masks. Prefer Magick Stick / manual tools until a stronger PCS path exists.

### What was tried (chronological)

1. **EfficientSAM3 PCS ONNX** (wkentaro-style EV-M) — export `image_encoder` + `decoder` + baked `"visual"` language feats; ORT CPU. App post-process: score≥0.2, keep best prompt-IoU, box-NMS@0.55.
2. **EfficientSAM3 PyTorch sidecar** — CUDA, warm image embed; same post-process; unload sibling backends for VRAM.
3. **YOLOE-11 Seg** (Ultralytics) — visual same-image bbox; default `yoloe-11m-seg` imgsz 1280 conf 0.1.
4. **Full SAM3 PCS PyTorch** — `build_sam3_image_model`, default CPU (3.3GB won't fit 4GB GPU). Strongest capacitor quality.
5. **sam3.cpp CPU** ([PABannier/sam3.cpp](https://github.com/PABannier/sam3.cpp)) — ggml Q4_0 / F16; PCS with `text_prompt="visual"`, exemplars **normalized XYXY [0,1]** (easy to get wrong — some comments say pixels). Worker binary + `LD_LIBRARY_PATH` to ggml `.so`s.

### Technical notes worth keeping

- PCS exemplars in sam3.cpp must be **normalized [0,1] XYXY**, not pixels. Use `"visual"` for geometry-only prompts (same as PyTorch).
- Need **full** SAM3 ggml (`sam3-q4_0.ggml` / `sam3-f16.ggml` from HF `PABannier/sam3.cpp`), not `sam3-visual-*`.
- EfficientSAM3 decoder returns 200 queries; never upsample all masks on 4GB VRAM.
- Loading one heavy sidecar should unload the others (VRAM / RAM).
- Sidecar protocol: line-delimited JSON on stdin/stdout; redirect library stdout → stderr so logs don't break the protocol.

### Artifacts left under `.tmp/` (optional cleanup)

| Path                                                                          | What                                                  |
| ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| `.tmp/sam3.cpp`, `.tmp/sam3cpp-exemplar/`                                     | Built sam3.cpp + exemplar worker                      |
| `.tmp/sam3.cpp-models/`                                                       | `sam3-q4_0.ggml` (~674 MB), `sam3-f16.ggml` (~2.3 GB) |
| `.tmp/efficientsam3*`, `.tmp/yoloe/`, `.tmp/sam3-official/`                   | Earlier sidecars / weights                            |
| App cache `~/…/Lee Label/Models/models/{yoloe-*,efficientsam3-*,sam3-cpp-*}/` | Installed weights (safe to delete)                    |

App code for Exemplar (UI tool, IPC `yoloe:*` / `efficientsam3:*` / `sam3:*`, workers, probes) was deleted 2026-07-18. Magick Stick **SAM3 tracker** (PVS) is unrelated and remains.

Assets on [`v0.1.0`](https://github.com/dantetemplar/lee-label/releases/tag/v0.1.0): `model-<id>-v1.zip` with `<id>/v1/{encoder.*,decoder.onnx}`.

`WEBSAM_RELEASE_TAG` in `src/shared/websam-models.ts` must match the hosting release. Registry: `src/shared/websam-models.ts`.
