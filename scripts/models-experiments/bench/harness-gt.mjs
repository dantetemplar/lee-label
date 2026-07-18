/**
 * Parse YOLO-poly GT + derive Magick Stick prompts for the capacitor fixture.
 * Normalized coords [0,1] relative to image size.
 */
export function parseGtPolygon(txt) {
  const parts = txt.trim().split(/\s+/).map(Number)
  const cls = parts[0]
  const xs = []
  const ys = []
  for (let i = 1; i < parts.length; i += 2) {
    xs.push(parts[i])
    ys.push(parts[i + 1])
  }
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length
  const cy = ys.reduce((a, b) => a + b, 0) / ys.length
  const pad = 0.002
  return {
    cls,
    polygon: xs.map((x, i) => [x, ys[i]]),
    bbox: {
      x1: Math.max(0, minX - pad),
      y1: Math.max(0, minY - pad),
      x2: Math.min(1, maxX + pad),
      y2: Math.min(1, maxY + pad)
    },
    center: { x: cx, y: cy }
  }
}

/** Negative point: left of bbox, vertically centered, still on image. */
export function negativeOutside(bbox) {
  const midY = (bbox.y1 + bbox.y2) / 2
  const w = bbox.x2 - bbox.x1
  return { x: Math.max(0.01, bbox.x1 - Math.max(0.03, w * 0.8)), y: midY }
}

export function derivePrompts(gt) {
  return {
    box: { type: 'box', box: gt.bbox },
    pos_neg: {
      type: 'points',
      points: [
        { x: gt.center.x, y: gt.center.y, label: 1 },
        { ...negativeOutside(gt.bbox), label: 0 }
      ]
    },
    pos_only: {
      type: 'points',
      points: [{ x: gt.center.x, y: gt.center.y, label: 1 }]
    }
  }
}

/** Rasterize polygon (normalized) to Uint8 mask [H*W], 1=fg. */
export function rasterizePolygon(polygon, width, height) {
  const mask = new Uint8Array(width * height)
  const pts = polygon.map(([x, y]) => [x * width, y * height])
  // scanline fill
  const minY = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1]))))
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...pts.map((p) => p[1]))))
  for (let y = minY; y <= maxY; y++) {
    const xs = []
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]
      const [xj, yj] = pts[j]
      if (yi > y !== yj > y) {
        xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi))
      }
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.floor(xs[k]))
      const x1 = Math.min(width - 1, Math.ceil(xs[k + 1]))
      for (let x = x0; x <= x1; x++) mask[y * width + x] = 1
    }
  }
  return mask
}

export function iouBinary(pred, gt, threshold = 0) {
  let inter = 0
  let uni = 0
  const n = Math.min(pred.length, gt.length)
  for (let i = 0; i < n; i++) {
    const p = pred[i] > threshold ? 1 : 0
    const g = gt[i] ? 1 : 0
    inter += p & g
    uni += p | g
  }
  return uni === 0 ? 0 : inter / uni
}

/** Map model mask → image-sized float logits (letterbox or stretch). */
export function maskToImage(src, mh, mw, H, W, mode = 'letterbox') {
  const out = new Float32Array(H * W)
  if (mh === H && mw === W) {
    out.set(src.subarray(0, H * W))
    return out
  }
  if (mode === 'stretch') {
    for (let y = 0; y < H; y++) {
      const sy = Math.min(mh - 1, ((y + 0.5) * mh) / H)
      const y0 = Math.floor(sy)
      const y1 = Math.min(mh - 1, y0 + 1)
      const fy = sy - y0
      for (let x = 0; x < W; x++) {
        const sx = Math.min(mw - 1, ((x + 0.5) * mw) / W)
        const x0 = Math.floor(sx)
        const x1 = Math.min(mw - 1, x0 + 1)
        const fx = sx - x0
        const v00 = src[y0 * mw + x0]
        const v01 = src[y0 * mw + x1]
        const v10 = src[y1 * mw + x0]
        const v11 = src[y1 * mw + x1]
        out[y * W + x] =
          v00 * (1 - fx) * (1 - fy) + v01 * fx * (1 - fy) + v10 * (1 - fx) * fy + v11 * fx * fy
      }
    }
    return out
  }
  // letterbox: mask square covers longest image edge
  const long = Math.max(W, H)
  for (let y = 0; y < H; y++) {
    const sy = Math.min(mh - 1, ((y + 0.5) * mh) / long)
    const y0 = Math.floor(sy)
    const y1 = Math.min(mh - 1, y0 + 1)
    const fy = sy - y0
    for (let x = 0; x < W; x++) {
      const sx = Math.min(mw - 1, ((x + 0.5) * mw) / long)
      const x0 = Math.floor(sx)
      const x1 = Math.min(mw - 1, x0 + 1)
      const fx = sx - x0
      const v00 = src[y0 * mw + x0]
      const v01 = src[y0 * mw + x1]
      const v10 = src[y1 * mw + x0]
      const v11 = src[y1 * mw + x1]
      out[y * W + x] =
        v00 * (1 - fx) * (1 - fy) + v01 * fx * (1 - fy) + v10 * (1 - fx) * fy + v11 * fx * fy
    }
  }
  return out
}

/** @deprecated use maskToImage */
export function upsampleMask(src, mh, mw, H, W) {
  return maskToImage(src, mh, mw, H, W, 'stretch')
}
