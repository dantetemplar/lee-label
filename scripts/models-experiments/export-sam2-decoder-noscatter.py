#!/usr/bin/env python3
"""Re-export SAM2.1 decoder without ScatterND (broadcast Div instead of coords[:,:,c]=)."""
from __future__ import annotations

import sys
from pathlib import Path

import torch
from torch import nn

ROOT = Path(__file__).resolve().parents[2]
EXPORT = ROOT / ".tmp" / "sam2-export"
sys.path.insert(0, str(EXPORT / "sam2"))

from sam2.build_sam import build_sam2  # noqa: E402


class SAM2ImageDecoder(nn.Module):
  def __init__(self, sam_model, multimask_output: bool = True) -> None:
    super().__init__()
    self.mask_decoder = sam_model.sam_mask_decoder
    self.prompt_encoder = sam_model.sam_prompt_encoder
    self.model = sam_model
    self.multimask_output = multimask_output

  @torch.no_grad()
  def forward(
    self,
    image_embed: torch.Tensor,
    high_res_feats_0: torch.Tensor,
    high_res_feats_1: torch.Tensor,
    point_coords: torch.Tensor,
    point_labels: torch.Tensor,
    mask_input: torch.Tensor,
    has_mask_input: torch.Tensor,
  ):
    sparse = self._embed_points(point_coords, point_labels)
    dense = self._embed_masks(mask_input, has_mask_input)
    masks, iou_predictions, _, _ = self.mask_decoder.predict_masks(
      image_embeddings=image_embed,
      image_pe=self.prompt_encoder.get_dense_pe(),
      sparse_prompt_embeddings=sparse,
      dense_prompt_embeddings=dense,
      repeat_image=False,
      high_res_features=[high_res_feats_0, high_res_feats_1],
    )
    if self.multimask_output:
      masks = masks[:, 1:, :, :]
      iou_predictions = iou_predictions[:, 1:]
    masks = torch.clamp(masks, -32.0, 32.0)
    return masks, iou_predictions

  def _embed_points(self, point_coords: torch.Tensor, point_labels: torch.Tensor) -> torch.Tensor:
    # Avoid coords[:,:,0]=... which Torch exports as ScatterND (bad on ORT WebGPU).
    point_coords = (point_coords + 0.5) / float(self.model.image_size)
    padding_point = torch.zeros((point_coords.shape[0], 1, 2), device=point_coords.device)
    padding_label = -torch.ones((point_labels.shape[0], 1), device=point_labels.device)
    point_coords = torch.cat([point_coords, padding_point], dim=1)
    point_labels = torch.cat([point_labels, padding_label], dim=1)

    point_embedding = self.prompt_encoder.pe_layer._pe_encoding(point_coords)
    point_labels = point_labels.unsqueeze(-1).expand_as(point_embedding)

    point_embedding = point_embedding * (point_labels != -1)
    point_embedding = point_embedding + self.prompt_encoder.not_a_point_embed.weight * (
      point_labels == -1
    )
    for i in range(self.prompt_encoder.num_point_embeddings):
      point_embedding = point_embedding + self.prompt_encoder.point_embeddings[i].weight * (
        point_labels == i
      )
    return point_embedding

  def _embed_masks(self, input_mask: torch.Tensor, has_mask_input: torch.Tensor) -> torch.Tensor:
    mask_embedding = has_mask_input * self.prompt_encoder.mask_downscaling(input_mask)
    mask_embedding = mask_embedding + (1 - has_mask_input) * self.prompt_encoder.no_mask_embed.weight.reshape(
      1, -1, 1, 1
    )
    return mask_embedding


def main() -> None:
  ckpt = EXPORT / "sam2.1_hiera_tiny.pt"
  out = ROOT / "scripts/models-experiments/optimize-out/sam2.1-tiny/v1/decoder.reexport.onnx"
  out.parent.mkdir(parents=True, exist_ok=True)

  # sam2 package configs live under sam2/configs
  model = build_sam2("configs/sam2.1/sam2.1_hiera_t.yaml", str(ckpt), device="cpu")
  dec = SAM2ImageDecoder(model, multimask_output=True).cpu().eval()

  image_embed = torch.zeros(1, 256, 64, 64)
  high0 = torch.zeros(1, 32, 256, 256)
  high1 = torch.zeros(1, 64, 128, 128)
  point_coords = torch.zeros(1, 2, 2)
  point_labels = torch.zeros(1, 2)
  mask_input = torch.zeros(1, 1, 256, 256)
  has_mask_input = torch.zeros(1)

  torch.onnx.export(
    dec,
    (image_embed, high0, high1, point_coords, point_labels, mask_input, has_mask_input),
    str(out),
    opset_version=17,
    do_constant_folding=True,
    dynamo=False,
    input_names=[
      "image_embed",
      "high_res_feats_0",
      "high_res_feats_1",
      "point_coords",
      "point_labels",
      "mask_input",
      "has_mask_input",
    ],
    output_names=["masks", "iou_predictions"],
    dynamic_axes={
      "point_coords": {0: "num_labels", 1: "num_points"},
      "point_labels": {0: "num_labels", 1: "num_points"},
      "mask_input": {0: "num_labels"},
      "has_mask_input": {0: "num_labels"},
    },
  )
  print("wrote", out, out.stat().st_size)

  import onnx
  from collections import Counter

  m = onnx.load(str(out))
  c = Counter(n.op_type for n in m.graph.node)
  print("ScatterND", c.get("ScatterND", 0), "GatherElements", c.get("GatherElements", 0), "nodes", sum(c.values()))


if __name__ == "__main__":
  main()
