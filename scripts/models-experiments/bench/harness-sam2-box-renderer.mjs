import * as ort from 'bench://app/ort/ort.all.min.mjs'
import { parseGtPolygon, derivePrompts, rasterizePolygon, iouBinary, maskToImage } from 'bench://app/harness-gt.mjs'

const logEl = document.getElementById('log')
function log(msg) {
  logEl.textContent += `\n${msg}`
  void window.sam3Api.log(msg)
}

async function copyT(t) {
  const d = typeof t.getData === 'function' ? await t.getData() : t.data
  return d instanceof Float32Array ? new Float32Array(d) : Float32Array.from(d)
}

let lastErr = null
async function hook() {
  const raw = ort.env.webgpu?.device
  const d = raw instanceof Promise ? await raw : raw
  if (!d) return
  d.addEventListener('uncapturederror', (e) => {
    lastErr = new Error(e.error?.message || 'gpu')
  })
}
async function idle(useGpu) {
  if (!useGpu) return
  const raw = ort.env.webgpu?.device
  const d = raw instanceof Promise ? await raw : raw
  if (d?.queue?.onSubmittedWorkDone) await d.queue.onSubmittedWorkDone()
  if (lastErr) {
    const e = lastErr
    lastErr = null
    throw e
  }
}

function letterbox(image, size = 1024) {
  const mean = [0.485, 0.456, 0.406]
  const std = [0.229, 0.224, 0.225]
  const scale = size / Math.max(image.width, image.height)
  const nw = Math.round(image.width * scale)
  const nh = Math.round(image.height * scale)
  const src = new OffscreenCanvas(image.width, image.height)
  src.getContext('2d').putImageData(
    new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
    0,
    0
  )
  const dst = new OffscreenCanvas(size, size)
  dst.getContext('2d').drawImage(src, 0, 0, nw, nh)
  const px = dst.getContext('2d').getImageData(0, 0, size, size).data
  const out = new Float32Array(3 * size * size)
  for (let i = 0; i < size * size; i++) {
    const r = i * 4
    for (let c = 0; c < 3; c++) out[c * size * size + i] = (px[r + c] / 255 - mean[c]) / std[c]
  }
  return { tensor: out, scale }
}

function score(masks, scores, mh, mw, gt, H, W) {
  const n = Math.min(3, scores.length)
  const ious = []
  for (let i = 0; i < n; i++) {
    const slice = masks.subarray(i * mh * mw, (i + 1) * mh * mw)
    const up = maskToImage(slice, mh, mw, H, W, 'letterbox')
    ious.push(iouBinary(up, gt, 0))
  }
  const best = scores.indexOf(Math.max(...scores.slice(0, n)))
  return { scores: [...scores].slice(0, n), ious, best, bestIou: ious[best] ?? 0 }
}

async function decode(dec, emb, pts, labs, useGpu) {
  lastErr = null
  const dout = await dec.run({
    point_coords: new ort.Tensor('float32', pts, [1, pts.length / 2, 2]),
    point_labels: new ort.Tensor('float32', labs, [1, labs.length]),
    image_embed: new ort.Tensor('float32', emb.ie, [1, 256, 64, 64]),
    high_res_feats_0: new ort.Tensor('float32', emb.h0, [1, 32, 256, 256]),
    high_res_feats_1: new ort.Tensor('float32', emb.h1, [1, 64, 128, 128]),
    mask_input: new ort.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256]),
    has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1])
  })
  await idle(useGpu)
  const scores = [...(await copyT(dout.iou_predictions))].slice(0, 3)
  const masks = await copyT(dout.masks)
  const dims = dout.masks.dims
  return { scores, masks, mh: Number(dims[dims.length - 2]), mw: Number(dims[dims.length - 1]) }
}

window.__run = async function run() {
  const cfg = await (await fetch('bench://app/config.json')).json()
  const useGpu = cfg.backend === 'webgpu'
  const out = { backend: cfg.backend, ok: false, cases: {} }
  try {
    ort.env.logLevel = 'warning'
    ort.env.wasm.wasmPaths = 'bench://app/ort/'
    ort.env.wasm.numThreads = useGpu ? 1 : 4
    if (useGpu) {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      ort.env.webgpu.adapter = adapter
      ort.env.webgpu.powerPreference = 'high-performance'
    }
    // Match app: explicit NCHW on WebGPU
    const ep = useGpu ? [{ name: 'webgpu', preferredLayout: 'NCHW' }] : ['wasm']
    const encBuf = await (await fetch('bench://app/models/encoder')).arrayBuffer()
    const decBuf = await (await fetch('bench://app/models/decoder')).arrayBuffer()
    const enc = await ort.InferenceSession.create(encBuf, {
      executionProviders: ep,
      graphOptimizationLevel: 'disabled'
    })
    const dec = await ort.InferenceSession.create(decBuf, { executionProviders: ep })
    if (useGpu) await hook()

    const bmp = await createImageBitmap(await (await fetch('bench://app/fixture.png')).blob())
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    c.getContext('2d').drawImage(bmp, 0, 0)
    const id = c.getContext('2d').getImageData(0, 0, c.width, c.height)
    bmp.close()
    const image = { data: id.data, width: c.width, height: c.height }
    const gt = parseGtPolygon(await (await fetch('bench://app/fixture.txt')).text())
    const prompts = derivePrompts(gt)
    const gtMask = rasterizePolygon(gt.polygon, c.width, c.height)
    const { tensor, scale } = letterbox(image)
    const eout = await enc.run({ image: new ort.Tensor('float32', tensor, [1, 3, 1024, 1024]) })
    await idle(useGpu)
    const emb = {
      ie: await copyT(eout.image_embed),
      h0: await copyT(eout.high_res_feats_0),
      h1: await copyT(eout.high_res_feats_1)
    }

    const W = c.width
    const H = c.height
    const b = prompts.box.box
    const x1 = b.x1 * W * scale
    const y1 = b.y1 * H * scale
    const x2 = b.x2 * W * scale
    const y2 = b.y2 * H * scale
    const cx = gt.center.x * W * scale
    const cy = gt.center.y * H * scale
    const neg = prompts.pos_neg.points[1]
    const nx = neg.x * W * scale
    const ny = neg.y * H * scale

    const feeds = {
      cold_box: { pts: new Float32Array([x1, y1, x2, y2]), labs: new Float32Array([2, 3]) },
      box_again: { pts: new Float32Array([x1, y1, x2, y2]), labs: new Float32Array([2, 3]) },
      pos_only: { pts: new Float32Array([cx, cy]), labs: new Float32Array([1]) },
      pos_neg: { pts: new Float32Array([cx, cy, nx, ny]), labs: new Float32Array([1, 0]) }
    }

    for (const [name, feed] of Object.entries(feeds)) {
      const d = await decode(dec, emb, feed.pts, feed.labs, useGpu)
      const s = score(d.masks, d.scores, d.mh, d.mw, gtMask, H, W)
      out.cases[name] = { ok: true, bestIou: s.bestIou, scores: s.scores }
      log(`${name}: iou=${s.bestIou.toFixed(3)} scores=[${s.scores.map((v) => v.toFixed(3)).join(',')}]`)
    }

    // Fresh decoder: cold box only (no prior warmup) with NCHW
    const dec2 = await ort.InferenceSession.create(decBuf, { executionProviders: ep })
    const d = await decode(dec2, emb, feeds.cold_box.pts, feeds.cold_box.labs, useGpu)
    const s = score(d.masks, d.scores, d.mh, d.mw, gtMask, H, W)
    out.cases.fresh_cold_box = { ok: true, bestIou: s.bestIou, scores: s.scores }
    log(`fresh_cold_box: iou=${s.bestIou.toFixed(3)}`)
    await dec2.release()

    out.ok = Object.values(out.cases).every((c) => c.ok && c.bestIou >= 0.5)
    await enc.release()
    await dec.release()
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e)
    log(`ERROR ${out.error}`)
  }
  return out
}

log('sam2 nchw verify ready')
await window.sam3Api.ready()
