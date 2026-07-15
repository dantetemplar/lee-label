#!/usr/bin/env python3
"""Probe wkentaro SAM3 ONNX (visual-only) with a box prompt.

Downloads are expected under .tmp/sam3-wkentaro/ (image encoder + decoder).
Language encoder is optional: we cache a fixed \"visual\" embedding once.

Usage:
  python3 scripts/models-experiments/probe-sam3-wkentaro.py \\
    --image /path/to.png --box 0.32,0.40,0.06,0.06
"""
from __future__ import annotations

import argparse
import gzip
import html
import urllib.request
from pathlib import Path

import ftfy
import numpy as np
import onnxruntime as ort
import regex as re
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.tmp' / 'sam3-wkentaro'
BPE_PATH = CACHE / 'bpe_simple_vocab_16e6.txt.gz'
LANG_CACHE = CACHE / 'visual_language_cache.npz'


def bytes_to_unicode() -> dict[int, str]:
  bs = (
    list(range(ord('!'), ord('~') + 1))
    + list(range(ord('¡'), ord('¬') + 1))
    + list(range(ord('®'), ord('ÿ') + 1))
  )
  cs = bs[:]
  n = 0
  for b in range(2**8):
    if b not in bs:
      bs.append(b)
      cs.append(2**8 + n)
      n += 1
  return dict(zip(bs, [chr(c) for c in cs]))


def get_pairs(word: tuple[str, ...]) -> set[tuple[str, str]]:
  pairs: set[tuple[str, str]] = set()
  prev = word[0]
  for ch in word[1:]:
    pairs.add((prev, ch))
    prev = ch
  return pairs


class SimpleTokenizer:
  def __init__(self, bpe_path: Path) -> None:
    self.byte_encoder = bytes_to_unicode()
    merges = gzip.open(bpe_path).read().decode('utf-8').split('\n')
    merges = merges[1 : 49152 - 256 - 2 + 1]
    merges = [tuple(m.split()) for m in merges]
    vocab = list(bytes_to_unicode().values())
    vocab = vocab + [v + '</w>' for v in vocab]
    for merge in merges:
      vocab.append(''.join(merge))
    vocab.extend(['<|startoftext|>', '<|endoftext|>'])
    self.encoder = dict(zip(vocab, range(len(vocab))))
    self.bpe_ranks = dict(zip(merges, range(len(merges))))
    self.cache = {'<|startoftext|>': '<|startoftext|>', '<|endoftext|>': '<|endoftext|>'}
    self.pat = re.compile(
      r"""<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]|[^\s\p{L}\p{N}]+""",
      re.IGNORECASE,
    )

  def bpe(self, token: str) -> str:
    if token in self.cache:
      return self.cache[token]
    word = tuple(token[:-1]) + (token[-1] + '</w>',)
    pairs = get_pairs(word)
    if not pairs:
      return token + '</w>'
    while True:
      bigram = min(pairs, key=lambda p: self.bpe_ranks.get(p, float('inf')))
      if bigram not in self.bpe_ranks:
        break
      first, second = bigram
      new_word: list[str] = []
      i = 0
      while i < len(word):
        try:
          j = word.index(first, i)
          new_word.extend(word[i:j])
          i = j
        except ValueError:
          new_word.extend(word[i:])
          break
        if word[i] == first and i < len(word) - 1 and word[i + 1] == second:
          new_word.append(first + second)
          i += 2
        else:
          new_word.append(word[i])
          i += 1
      word = tuple(new_word)
      if len(word) == 1:
        break
      pairs = get_pairs(word)
    out = ' '.join(word)
    self.cache[token] = out
    return out

  def encode(self, text: str) -> list[int]:
    bpe_tokens: list[int] = []
    text = ftfy.fix_text(text)
    text = html.unescape(html.unescape(text)).replace('\n', ' ').lower().strip()
    for token in re.findall(self.pat, text):
      token = ''.join(self.byte_encoder[b] for b in token.encode('utf-8'))
      bpe_tokens.extend(self.encoder[bpe_token] for bpe_token in self.bpe(token).split(' '))
    return bpe_tokens


def tokenize(texts: list[str], context_length: int = 32) -> np.ndarray:
  if not BPE_PATH.exists():
    urllib.request.urlretrieve(
      'https://openaipublic.azureedge.net/clip/bpe_simple_vocab_16e6.txt.gz',
      BPE_PATH,
    )
  tok = SimpleTokenizer(BPE_PATH)
  sot, eot = tok.encoder['<|startoftext|>'], tok.encoder['<|endoftext|>']
  result = np.zeros((len(texts), context_length), dtype=np.int64)
  for i, text in enumerate(texts):
    tokens = [sot] + tok.encode(text) + [eot]
    if len(tokens) > context_length:
      tokens = tokens[:context_length]
      tokens[-1] = eot
    result[i, : len(tokens)] = tokens
  return result


def ensure_visual_language_cache() -> tuple[np.ndarray, np.ndarray]:
  if LANG_CACHE.exists():
    z = np.load(LANG_CACHE)
    return z['language_mask'], z['language_features']
  lang_path = CACHE / 'sam3_language_encoder.onnx'
  if not lang_path.exists():
    raise FileNotFoundError(
      f'Missing {lang_path} (needed once to bake visual language cache). '
      'Download with: uvx hf download wkentaro/sam3-onnx-models-v0.3.0 '
      '--include "sam3_language_encoder.onnx*" --local-dir .tmp/sam3-wkentaro'
    )
  sess = ort.InferenceSession(str(lang_path), providers=['CPUExecutionProvider'])
  outs = sess.run(None, {'tokens': tokenize(['visual'])})
  names = [o.name for o in sess.get_outputs()]
  lang_map = dict(zip(names, outs))
  language_mask = lang_map['text_attention_mask'].astype(bool)
  language_features = lang_map['text_memory'].astype(np.float32)
  np.savez(LANG_CACHE, language_mask=language_mask, language_features=language_features)
  return language_mask, language_features


def main() -> None:
  ap = argparse.ArgumentParser()
  ap.add_argument('--image', type=Path, required=True)
  ap.add_argument(
    '--box',
    type=str,
    default='0.32,0.40,0.06,0.06',
    help='Normalized cx,cy,w,h (Magick Stick click ≈ small box around point)',
  )
  ap.add_argument('--out', type=Path, default=CACHE / 'probe-overlay.png')
  args = ap.parse_args()
  cx, cy, bw, bh = [float(x) for x in args.box.split(',')]

  enc_fp16 = CACHE / 'sam3_image_encoder.fp16.onnx'
  enc_path = enc_fp16 if enc_fp16.exists() else CACHE / 'sam3_image_encoder.onnx'
  dec_path = CACHE / 'sam3_decoder.onnx'
  if not enc_path.exists() or not dec_path.exists():
    raise FileNotFoundError(f'Missing visual models under {CACHE}')
  print('encoder', enc_path.name)

  language_mask, language_features = ensure_visual_language_cache()
  img = Image.open(args.image).convert('RGB')
  w, h = img.size
  chw = np.asarray(img.resize((1008, 1008), Image.BILINEAR)).transpose(2, 0, 1)

  enc = ort.InferenceSession(str(enc_path), providers=['CPUExecutionProvider'])
  dec = ort.InferenceSession(str(dec_path), providers=['CPUExecutionProvider'])
  emap = dict(zip([o.name for o in enc.get_outputs()], enc.run(None, {'image': chw})))
  boxes, scores, masks = dec.run(
    None,
    {
      'backbone_fpn_0': emap['backbone_fpn_0'],
      'backbone_fpn_1': emap['backbone_fpn_1'],
      'backbone_fpn_2': emap['backbone_fpn_2'],
      'vision_pos_enc_2': emap['vision_pos_enc_2'],
      'language_mask': language_mask,
      'language_features': language_features,
      'box_coords': np.array([[[cx, cy, bw, bh]]], np.float32),
      'box_labels': np.array([[1]], np.int64),
      'box_masks': np.array([[False]]),
    },
  )
  print(f'n={len(scores)} top_score={float(scores[0]) if len(scores) else None}')
  for i in range(min(3, len(scores))):
    area = float((masks[i, 0] > 0.5).mean())
    print(f'  [{i}] score={float(scores[i]):.3f} area={area:.4f} box={boxes[i]}')

  if len(scores) == 0:
    return
  m = (masks[0, 0] > 0.5).astype(np.uint8)
  m_img = Image.fromarray(m * 255).resize((w, h), Image.NEAREST)
  overlay = img.copy().convert('RGBA')
  red = Image.new('RGBA', (w, h), (255, 40, 40, 0))
  red.putalpha(m_img.point(lambda p: 110 if p > 0 else 0))
  out = Image.alpha_composite(overlay, red)
  draw = ImageDraw.Draw(out)
  draw.rectangle(
    [(cx - bw / 2) * w, (cy - bh / 2) * h, (cx + bw / 2) * w, (cy + bh / 2) * h],
    outline=(0, 255, 0),
    width=2,
  )
  bx = boxes[0]
  draw.rectangle([bx[0] * w, bx[1] * h, bx[2] * w, bx[3] * h], outline=(0, 180, 255), width=2)
  args.out.parent.mkdir(parents=True, exist_ok=True)
  out.convert('RGB').save(args.out)
  print('saved', args.out)


if __name__ == '__main__':
  main()
