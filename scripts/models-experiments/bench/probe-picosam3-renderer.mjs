import * as ort from 'bench://app/ort/ort.all.min.mjs'
import { parseGtPolygon, rasterizePolygon, iouBinary } from 'bench://app/harness-gt.mjs'

const logEl = document.getElementById('log')
function log(msg) {
  logEl.textContent += `\n${msg}`
  void window.sam3Api.log(msg)
}

async function copyT(t) {
  const d = typeof t.getData === 'function' ? await t.getData() : t.data
  return d instanceof Float32Array ? new Float32Array(d) : Float32Array.from(d)
}

function padBboxToSquare(bbox, imgW, imgH, padding = 0.1) {
  let [x, y, w, h] = bbox
  x -= w * padding
  y -= h * padding
  w += 2 * w * padding
  h += 2 * h * padding
  const size = Math.max(w, h)
  const cx = x + w / 2
  const cy = y + h / 2
  const x1 = Math.max(0, Math.floor(cx - size / 2))
  const y1 = Math.max(0, Math.floor(cy - size / 2))
  const x2 = Math.min(imgW, Math.ceil(cx + size / 2))
  const y2 = Math.min(imgH, Math.ceil(cy + size / 2))
  return [x1, y1, x2, y2]
}

function sigmoid(a) {
  const o = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) o[i] = 1 / (1 + Math.exp(-a[i]))
  return o
}

/** Bilinear upsample 96×96 → roiW×roiH, threshold → full-image mask. */
function upsampleMask(prob96, roiW, roiH, x1, y1, H, W, thr = 0.5) {
  const out = new Uint8Array(H * W)
  for (let y = 0; y < roiH; y++) {
    const sy = ((y + 0.5) * 96) / roiH - 0.5
    const y0 = Math.max(0, Math.min(95, Math.floor(sy)))
    const y1s = Math.min(95, y0 + 1)
    const fy = sy - y0
    for (let x = 0; x < roiW; x++) {
      const sx = ((x + 0.5) * 96) / roiW - 0.5
      const x0 = Math.max(0, Math.min(95, Math.floor(sx)))
      const x1s = Math.min(95, x0 + 1)
      const fx = sx - x0
      const v00 = prob96[y0 * 96 + x0]
      const v01 = prob96[y0 * 96 + x1s]
      const v10 = prob96[y1s * 96 + x0]
      const v11 = prob96[y1s * 96 + x1s]
      const v = v00 * (1 - fx) * (1 - fy) + v01 * fx * (1 - fy) + v10 * (1 - fx) * fy + v11 * fx * fy
      if (v > thr) out[(y1 + y) * W + (x1 + x)] = 1
    }
  }
  return out
}

window.__run = async function run() {
  const cfg = await (await fetch('bench://app/config.json')).json()
  const useGpu = cfg.backend === 'webgpu'
  const out = { backend: cfg.backend, ok: false }
  try {
    ort.env.logLevel = 'warning'
    ort.env.wasm.wasmPaths = 'bench://app/ort/'
    ort.env.wasm.numThreads = useGpu ? 1 : 4
    if (useGpu) {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      ort.env.webgpu.adapter = adapter
      ort.env.webgpu.powerPreference = 'high-performance'
    }
    const ep = useGpu ? [{ name: 'webgpu', preferredLayout: 'NCHW' }] : ['wasm']
    const buf = await (await fetch('bench://app/model.onnx')).arrayBuffer()
    const t0 = performance.now()
    const sess = await ort.InferenceSession.create(buf, { executionProviders: ep })
    out.loadMs = performance.now() - t0

    const bmp = await createImageBitmap(await (await fetch('bench://app/fixture.png')).blob())
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    c.getContext('2d').drawImage(bmp, 0, 0)
    const id = c.getContext('2d').getImageData(0, 0, c.width, c.height)
    bmp.close()
    const W = c.width
    const H = c.height
    const gt = parseGtPolygon(await (await fetch('bench://app/fixture.txt')).text())
    const gtMask = rasterizePolygon(gt.polygon, W, H)
    const b = gt.bbox
    const bx = b.x1 * W
    const by = b.y1 * H
    const bw = (b.x2 - b.x1) * W
    const bh = (b.y2 - b.y1) * H
    const [x1, y1, x2, y2] = padBboxToSquare([bx, by, bw, bh], W, H, 0.1)
    const roiW = x2 - x1
    const roiH = y2 - y1
    log(`roi=[${x1},${y1},${x2},${y2}] ${roiW}x${roiH}`)

    const crop = document.createElement('canvas')
    crop.width = 96
    crop.height = 96
    crop.getContext('2d').drawImage(c, x1, y1, roiW, roiH, 0, 0, 96, 96)
    const px = crop.getContext('2d').getImageData(0, 0, 96, 96).data
    const mean = [0.485, 0.456, 0.406]
    const std = [0.229, 0.224, 0.225]
    const tensor = new Float32Array(3 * 96 * 96)
    for (let i = 0; i < 96 * 96; i++) {
      for (let ch = 0; ch < 3; ch++) {
        tensor[ch * 96 * 96 + i] = (px[i * 4 + ch] / 255 - mean[ch]) / std[ch]
      }
    }

    const t1 = performance.now()
    const res = await sess.run({ image: new ort.Tensor('float32', tensor, [1, 3, 96, 96]) })
    out.inferMs = performance.now() - t1
    const logits = await copyT(res.mask)
    const prob = sigmoid(logits)
    const mask = upsampleMask(prob, roiW, roiH, x1, y1, H, W, 0.5)
    let area = 0
    for (let i = 0; i < mask.length; i++) if (mask[i]) area++
    const iou = iouBinary(mask, gtMask, 0)
    out.iou = iou
    out.area = area / (H * W)
    out.roi = { x1, y1, x2, y2 }
    out.ok = iou >= 0.5
    log(
      `${cfg.backend}: iou=${iou.toFixed(3)} area=${(out.area * 100).toFixed(3)}% load=${out.loadMs.toFixed(0)}ms infer=${out.inferMs.toFixed(1)}ms`
    )
    await sess.release()
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e)
    log(`ERROR ${out.error}`)
  }
  return out
}

log('picosam3 probe ready')
await window.sam3Api.ready()
