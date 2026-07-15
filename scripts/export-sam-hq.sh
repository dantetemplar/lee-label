#!/usr/bin/env bash
# Export SAM-HQ ONNX/ORT packages for one or more backbones.
# Usage: scripts/export-sam-hq-tiny.sh [tiny|base|large|huge|all]
set -euo pipefail

VARIANTS="${1:-all}"
WORKDIR="${WORKDIR:-/tmp/sam-hq-export}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_DIR="$WORKDIR/sam-hq"

declare -A CKPT MODEL_TYPE MODEL_ID EMBED_DIM INTERM_N
CKPT[tiny]=sam_hq_vit_tiny.pth
CKPT[base]=sam_hq_vit_b.pth
CKPT[large]=sam_hq_vit_l.pth
CKPT[huge]=sam_hq_vit_h.pth
MODEL_TYPE[tiny]=vit_tiny
MODEL_TYPE[base]=vit_b
MODEL_TYPE[large]=vit_l
MODEL_TYPE[huge]=vit_h
MODEL_ID[tiny]=sam-hq-tiny
MODEL_ID[base]=sam-hq-base
MODEL_ID[large]=sam-hq-large
MODEL_ID[huge]=sam-hq-huge
EMBED_DIM[tiny]=160
EMBED_DIM[base]=768
EMBED_DIM[large]=1024
EMBED_DIM[huge]=1280
INTERM_N[tiny]=1
INTERM_N[base]=4
INTERM_N[large]=4
INTERM_N[huge]=4

mkdir -p "$WORKDIR"
cd "$WORKDIR"

if [[ ! -d "$REPO_DIR/.venv" ]]; then
  curl -fsSL --max-time 60 -o export_encoder_onnx_model.py \
    "https://cdn.jsdelivr.net/gh/digitalcarp/RawNNX@dev/scripts/onnx_export/sam-hq/export_encoder_onnx_model.py"
  curl -fsSL --max-time 60 -o onnx_image_encoder.py \
    "https://cdn.jsdelivr.net/gh/digitalcarp/RawNNX@dev/scripts/onnx_export/sam-hq/onnx_image_encoder.py"
  git clone --depth 1 https://github.com/SysCV/sam-hq.git
  cp export_encoder_onnx_model.py onnx_image_encoder.py sam-hq/
  cd sam-hq
  uv venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  uv pip install --python .venv/bin/python torch --index-url https://download.pytorch.org/whl/cpu
  uv pip install --python .venv/bin/python --index-url https://download.pytorch.org/whl/cpu torchvision
  uv pip install --python .venv/bin/python onnx onnxruntime onnxscript timm
  uv pip install --python .venv/bin/python -e .
else
  cd "$REPO_DIR"
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

export_one() {
  local variant="$1"
  local ckpt_name="${CKPT[$variant]}"
  local model_type="${MODEL_TYPE[$variant]}"
  local model_id="${MODEL_ID[$variant]}"
  local embed_dim="${EMBED_DIM[$variant]}"
  local interm_n="${INTERM_N[$variant]}"
  local ckpt_path="$WORKDIR/$ckpt_name"
  local out_zip="$ROOT/model-${model_id}-v1.zip"

  echo "=== Exporting $model_id ($model_type) ==="
  if [[ ! -f "$ckpt_path" ]]; then
    curl -fL --max-time 600 -o "$ckpt_path" \
      "https://huggingface.co/lkeab/hq-sam/resolve/main/$ckpt_name"
  fi

  CKPT_PATH="$ckpt_path" MODEL_TYPE="$model_type" EMBED_DIM="$embed_dim" INTERM_N="$interm_n" \
  ENC_OUT="$WORKDIR/${model_id}-encoder.onnx" DEC_OUT="$WORKDIR/${model_id}-decoder.onnx" \
  .venv/bin/python <<'PY'
import os, warnings, torch
from segment_anything import sam_model_registry
from onnx_image_encoder import ImageEncoderOnnxModel
from segment_anything.utils.onnx import SamOnnxModel

ckpt = os.environ['CKPT_PATH']
model_type = os.environ['MODEL_TYPE']
embed_dim = int(os.environ['EMBED_DIM'])
interm_n = int(os.environ['INTERM_N'])
enc_out = os.environ['ENC_OUT']
dec_out = os.environ['DEC_OUT']

sam = sam_model_registry[model_type](checkpoint=ckpt)

enc_model = ImageEncoderOnnxModel(model=sam, use_preprocess=False)
dummy = torch.randn(1, 3, 1024, 1024)
_ = enc_model(dummy)
with warnings.catch_warnings():
    warnings.filterwarnings('ignore')
    torch.onnx.export(
        enc_model, dummy, enc_out, dynamo=False,
        export_params=True, opset_version=17, do_constant_folding=True,
        input_names=['input_image'],
        output_names=['image_embeddings', 'interm_embeddings'],
    )
print('encoder', enc_out, os.path.getsize(enc_out))

dec_model = SamOnnxModel(model=sam, hq_token_only=True, multimask_output=False)
prompt_dim = sam.prompt_encoder.embed_dim
embed_size = sam.prompt_encoder.image_embedding_size
mask_input_size = [4 * x for x in embed_size]
dummy_inputs = {
    'image_embeddings': torch.randn(1, prompt_dim, *embed_size),
    'interm_embeddings': torch.randn(interm_n, 1, *embed_size, embed_dim),
    'point_coords': torch.randint(0, 1024, (1, 5, 2)).float(),
    'point_labels': torch.randint(0, 4, (1, 5)).float(),
    'mask_input': torch.randn(1, 1, *mask_input_size),
    'has_mask_input': torch.tensor([1.0]),
    'orig_im_size': torch.tensor([1024.0, 1024.0]),
}
_ = dec_model(**dummy_inputs)
with warnings.catch_warnings():
    warnings.filterwarnings('ignore')
    torch.onnx.export(
        dec_model, tuple(dummy_inputs.values()), dec_out, dynamo=False,
        export_params=True, opset_version=17, do_constant_folding=True,
        input_names=list(dummy_inputs.keys()),
        output_names=['masks', 'iou_predictions', 'low_res_masks'],
        dynamic_axes={'point_coords': {1: 'num_points'}, 'point_labels': {1: 'num_points'}},
    )
print('decoder', dec_out, os.path.getsize(dec_out))
PY

  .venv/bin/python -m onnxruntime.tools.convert_onnx_models_to_ort \
    "$WORKDIR/${model_id}-encoder.onnx" \
    --optimization_style Runtime

  local pkg="$WORKDIR/pkg-$model_id"
  rm -rf "$pkg"
  mkdir -p "$pkg/$model_id/v1"
  cp "$WORKDIR/${model_id}-encoder.with_runtime_opt.ort" "$pkg/$model_id/v1/encoder.ort"
  cp "$WORKDIR/${model_id}-decoder.onnx" "$pkg/$model_id/v1/decoder.onnx"
  (cd "$pkg" && zip -r "$out_zip" "$model_id")
  ls -lh "$out_zip"
  # Free space for next variant
  rm -f "$ckpt_path" \
    "$WORKDIR/${model_id}-encoder.onnx" \
    "$WORKDIR/${model_id}-encoder.ort" \
    "$WORKDIR/${model_id}-encoder.with_runtime_opt.ort" \
    "$WORKDIR/${model_id}-decoder.onnx"
  rm -rf "$pkg"
  rm -f "$WORKDIR"/${model_id}-encoder.required_operators*.config
  echo "Done $model_id -> $out_zip"
}

if [[ "$VARIANTS" == "all" ]]; then
  LIST=(tiny base large)
else
  LIST=("$VARIANTS")
fi

for v in "${LIST[@]}"; do
  export_one "$v"
done
