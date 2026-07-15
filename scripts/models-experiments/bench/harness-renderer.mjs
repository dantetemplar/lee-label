import * as ort from 'bench://app/ort/ort.all.min.mjs'
import {
  parseGtPolygon,
  derivePrompts,
  rasterizePolygon,
  iouBinary,
  maskToImage
} from 'bench://app/harness-gt.mjs'

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

function letterboxFloat(image, size, mean, std) {
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
  const ctx = dst.getContext('2d')
  ctx.drawImage(src, 0, 0, nw, nh)
  const px = ctx.getImageData(0, 0, size, size).data
  const out = new Float32Array(3 * size * size)
  for (let i = 0; i < size * size; i++) {
    const r = i * 4
    for (let c = 0; c < 3; c++) out[c * size * size + i] = (px[r + c] / 255 - mean[c]) / std[c]
  }
  return { tensor: out, scale }
}

function stretchFloat(image, size, mean, std) {
  const src = new OffscreenCanvas(image.width, image.height)
  src.getContext('2d').putImageData(
    new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
    0,
    0
  )
  const dst = new OffscreenCanvas(size, size)
  dst.getContext('2d').drawImage(src, 0, 0, size, size)
  const px = dst.getContext('2d').getImageData(0, 0, size, size).data
  const out = new Float32Array(3 * size * size)
  for (let i = 0; i < size * size; i++) {
    const r = i * 4
    for (let c = 0; c < 3; c++) out[c * size * size + i] = (px[r + c] / 255 - mean[c]) / std[c]
  }
  return out
}


function inferInterm(len) {
  const cands = [
    [1, 1, 64, 64, 160],
    [4, 1, 64, 64, 768],
    [4, 1, 64, 64, 1024]
  ]
  for (const d of cands) if (d.reduce((a, b) => a * b, 1) === len) return d
  throw new Error(`unknown interm len ${len}`)
}

function toModelXY(nx, ny, W, H, family, scale) {
  if (family === 'sam3') return [nx * 1008, ny * 1008]
  return [nx * W * scale, ny * H * scale]
}


function stabilityScores(masks, mh, mw, maskThreshold = 0.0, thresholdOffset = 1.0) {
  const plane = mh * mw
  const n = Math.max(1, Math.floor(masks.length / plane))
  const scores = new Float32Array(n)
  const hi = maskThreshold + thresholdOffset
  const lo = maskThreshold - thresholdOffset
  for (let m = 0; m < n; m++) {
    const off = m * plane
    let inter = 0
    let uni = 0
    for (let i = 0; i < plane; i++) {
      const v = masks[off + i]
      if (v > hi) inter++
      if (v > lo) uni++
    }
    scores[m] = uni > 0 ? inter / uni : 0
  }
  return scores
}

/** Harness prompts use normalized [0,1] image coords; letterbox long-side mapping. */
function rankEdgeSamHarness(masks, scores, mh, mw, positivePoints, outputW, outputH, maskThreshold = 0.0) {
  const plane = mh * mw
  const n = Math.max(1, Math.floor(masks.length / plane))
  const long = Math.max(outputW, outputH)
  const areas = new Float32Array(n)
  const contains = new Uint8Array(n)
  for (let m = 0; m < n; m++) {
    const off = m * plane
    let area = 0
    for (let i = 0; i < plane; i++) if (masks[off + i] > maskThreshold) area++
    areas[m] = area / plane
    let ok = true
    for (const p of positivePoints) {
      const mx = Math.max(0, Math.min(mw - 1, Math.round(((p.x * outputW) / long) * mw)))
      const my = Math.max(0, Math.min(mh - 1, Math.round(((p.y * outputH) / long) * mh)))
      if (masks[off + my * mw + mx] <= maskThreshold) {
        ok = false
        break
      }
    }
    contains[m] = ok ? 1 : 0
  }
  const candidates = []
  for (let m = 0; m < n; m++) if (contains[m] && areas[m] < 0.05) candidates.push(m)
  const pool = candidates.length ? candidates : [...scores.keys()].filter((m) => contains[m])
  if (!pool.length) return scores
  let bestScore = -Infinity
  for (const m of pool) bestScore = Math.max(bestScore, scores[m])
  const near = pool.filter((m) => scores[m] >= bestScore - 0.02)
  let winner = near[0]
  for (const m of near) if (areas[m] > areas[winner]) winner = m
  const ranked = new Float32Array(n)
  for (let m = 0; m < n; m++) ranked[m] = m === winner ? 1 : 0
  return ranked
}

function scoreResult(masks, scores, mh, mw, gtMask, H, W, threshold = 0, mode = 'letterbox') {
  const n = Math.min(scores.length, Math.floor(masks.length / (mh * mw)) || scores.length)
  const ious = []
  const areas = []
  for (let i = 0; i < n; i++) {
    const slice = masks.subarray(i * mh * mw, (i + 1) * mh * mw)
    const up = maskToImage(slice, mh, mw, H, W, mode)
    let area = 0
    for (let j = 0; j < up.length; j++) if (up[j] > threshold) area++
    areas.push(area / (H * W))
    ious.push(iouBinary(up, gtMask, threshold))
  }
  const best = scores.length ? scores.indexOf(Math.max(...scores)) : -1
  const bestIou = best >= 0 ? ious[best] ?? 0 : 0
  const maxIou = ious.length ? Math.max(...ious) : 0
  return { scores: [...scores].slice(0, n), ious, areas, best, bestIou, maxIou }
}

async function encode(model, enc, image, useGpu) {
  const family = model.family
  if (family === 'sam3') {
    const tensor = stretchFloat(image, 1008, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5])
    const eout = await enc.run({
      pixel_values: new ort.Tensor('float32', tensor, [1, 3, 1008, 1008])
    })
    await idle(useGpu)
    return { kind: 'sam3', eout, scale: null }
  }
  const { tensor, scale } = letterboxFloat(
    image,
    1024,
    [0.485, 0.456, 0.406],
    [0.229, 0.224, 0.225]
  )
  if (family === 'sam-hq') {
    const eout = await enc.run({
      input_image: new ort.Tensor('float32', tensor, [1, 3, 1024, 1024])
    })
    await idle(useGpu)
    return { kind: 'sam-hq', eout, scale }
  }
  if (family === 'edgesam') {
    const eout = await enc.run({
      image: new ort.Tensor('float32', tensor, [1, 3, 1024, 1024])
    })
    await idle(useGpu)
    return { kind: 'edgesam', eout, scale }
  }
  if (family === 'sam1') {
    const eout = await enc.run({
      pixel_values: new ort.Tensor('float32', tensor, [1, 3, 1024, 1024])
    })
    await idle(useGpu)
    return { kind: 'sam1', eout, scale }
  }
  const eout = await enc.run({
    image: new ort.Tensor('float32', tensor, [1, 3, 1024, 1024])
  })
  await idle(useGpu)
  // Copy embeds to CPU for stable multi-prompt decode feeds.
  return {
    kind: 'sam2.1',
    eout,
    scale,
    cpu: {
      ie: await copyT(eout.image_embed),
      h0: await copyT(eout.high_res_feats_0),
      h1: await copyT(eout.high_res_feats_1)
    }
  }
}

async function decodePrompt(model, dec, emb, image, prompt, useGpu) {
  const { W, H } = image
  const scale = emb.scale ?? 1
  const family = model.family

  // Build model-space points / box
  let points = []
  let labels = []
  let boxXyxy = null // model space x1,y1,x2,y2

  if (prompt.type === 'box') {
    const b = prompt.box
    if (family === 'sam3') {
      const [x1, y1] = toModelXY(b.x1, b.y1, W, H, family, scale)
      const [x2, y2] = toModelXY(b.x2, b.y2, W, H, family, scale)
      boxXyxy = [x1, y1, x2, y2]
    } else {
      const [x1, y1] = toModelXY(b.x1, b.y1, W, H, family, scale)
      const [x2, y2] = toModelXY(b.x2, b.y2, W, H, family, scale)
      points = [
        [x1, y1],
        [x2, y2]
      ]
      labels = [2, 3]
    }
  } else {
    for (const p of prompt.points) {
      points.push(toModelXY(p.x, p.y, W, H, family, scale))
      labels.push(p.label)
    }
  }

  if (emb.kind === 'sam3') {
    const eout = emb.eout
    const e0 = await copyT(eout['image_embeddings.0'])
    const e1 = await copyT(eout['image_embeddings.1'])
    const e2 = await copyT(eout['image_embeddings.2'])
    const hasPts = points.length > 0
    const hasBox = boxXyxy != null
    const pointsFlat = hasPts
      ? new Float32Array(points.flatMap((p) => p))
      : new Float32Array(0)
    const labelsFlat = hasPts
      ? BigInt64Array.from(labels.map((l) => BigInt(l)))
      : new BigInt64Array(0)
    const boxFlat = hasBox ? new Float32Array(boxXyxy) : new Float32Array(0)
    const dout = await dec.run({
      input_points: new ort.Tensor('float32', pointsFlat, [1, 1, points.length, 2]),
      input_labels: new ort.Tensor('int64', labelsFlat, [1, 1, points.length]),
      input_boxes: new ort.Tensor('float32', boxFlat, [1, hasBox ? 1 : 0, 4]),
      'image_embeddings.0': new ort.Tensor('float32', e0, eout['image_embeddings.0'].dims),
      'image_embeddings.1': new ort.Tensor('float32', e1, eout['image_embeddings.1'].dims),
      'image_embeddings.2': new ort.Tensor('float32', e2, eout['image_embeddings.2'].dims)
    })
    await idle(useGpu)
    const iou = await copyT(dout.iou_scores)
    const scores = [...iou].slice(0, 3)
    const masks = await copyT(dout.pred_masks)
    const dims = dout.pred_masks.dims
    const mh = Number(dims[dims.length - 2])
    const mw = Number(dims[dims.length - 1])
    return { masks, scores, mh, mw, threshold: 0 }
  }

  if (emb.kind === 'sam1') {
    const eout = emb.eout
    const ie = await copyT(eout.image_embeddings)
    const pe = await copyT(eout.image_positional_embeddings)
    const pointsFlat = new Float32Array(points.flatMap((p) => p))
    const labelsFlat = BigInt64Array.from(labels.map((l) => BigInt(l)))
    const dout = await dec.run({
      input_points: new ort.Tensor('float32', pointsFlat, [1, 1, points.length, 2]),
      input_labels: new ort.Tensor('int64', labelsFlat, [1, 1, points.length]),
      image_embeddings: new ort.Tensor('float32', ie, [1, 256, 64, 64]),
      image_positional_embeddings: new ort.Tensor('float32', pe, [1, 256, 64, 64])
    })
    await idle(useGpu)
    const scores = [...(await copyT(dout.iou_scores))].slice(0, 3)
    const masks = await copyT(dout.pred_masks)
    const dims = dout.pred_masks.dims
    // pred_masks: [1, 1, 3, H, W] — flatten multimask for scoring
    const mh = Number(dims[dims.length - 2])
    const mw = Number(dims[dims.length - 1])
    return { masks, scores, mh, mw, threshold: 0 }
  }

  if (emb.kind === 'sam-hq') {
    const eout = emb.eout
    const ie = await copyT(eout.image_embeddings)
    const interm = await copyT(eout.interm_embeddings)
    const intermDims = model.intermDims || inferInterm(interm.length)
    const pointsFlat = new Float32Array(points.flatMap((p) => p))
    const labelsFlat = new Float32Array(labels)
    const dout = await dec.run({
      image_embeddings: new ort.Tensor('float32', ie, [1, 256, 64, 64]),
      interm_embeddings: new ort.Tensor('float32', interm, intermDims),
      point_coords: new ort.Tensor('float32', pointsFlat, [1, points.length, 2]),
      point_labels: new ort.Tensor('float32', labelsFlat, [1, points.length]),
      mask_input: new ort.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256]),
      has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1]),
      orig_im_size: new ort.Tensor('float32', new Float32Array([H, W]), [2])
    })
    await idle(useGpu)
    const sc = await copyT(dout.iou_predictions)
    const masks = await copyT(dout.masks)
    const dims = dout.masks.dims
    const mh = Number(dims[dims.length - 2])
    const mw = Number(dims[dims.length - 1])
    // HQ decoder can emit multimask or single — take available scores
    const scores = [...sc]
    return { masks, scores: scores.length ? scores : [sc[0] ?? 0], mh, mw, threshold: 0 }
  }

  if (emb.kind === 'edgesam') {
    const eout = emb.eout
    const ie = await copyT(eout.image_embeddings)
    const pointsFlat = new Float32Array(points.flatMap((p) => p))
    const labelsFlat = new Float32Array(labels)
    const dout = await dec.run({
      image_embeddings: new ort.Tensor('float32', ie, [1, 256, 64, 64]),
      point_coords: new ort.Tensor('float32', pointsFlat, [1, points.length, 2]),
      point_labels: new ort.Tensor('float32', labelsFlat, [1, points.length])
    })
    await idle(useGpu)
    const masks = await copyT(dout.masks)
    const dims = dout.masks.dims
    const mh = Number(dims[dims.length - 2])
    const mw = Number(dims[dims.length - 1])
    let scores = [...stabilityScores(masks, mh, mw)]
    // Match app EdgeSAM point ranking (stability + area prior).
    const posPts = (prompt.points || []).filter((p) => p.label === 1)
    if (posPts.length > 0) {
      scores = [...rankEdgeSamHarness(masks, scores, mh, mw, posPts, W, H)]
    }
    return { masks, scores, mh, mw, threshold: 0 }
  }

  // sam2.1
  const eout = emb.eout
  const ie = emb.cpu?.ie ?? (await copyT(eout.image_embed))
  const h0 = emb.cpu?.h0 ?? (await copyT(eout.high_res_feats_0))
  const h1 = emb.cpu?.h1 ?? (await copyT(eout.high_res_feats_1))
  const pointsFlat = new Float32Array(points.flatMap((p) => p))
  const labelsFlat = new Float32Array(labels)
  const feeds = {
    point_coords: new ort.Tensor('float32', pointsFlat, [1, points.length, 2]),
    point_labels: new ort.Tensor('float32', labelsFlat, [1, points.length]),
    image_embed: new ort.Tensor('float32', ie, [1, 256, 64, 64]),
    high_res_feats_0: new ort.Tensor('float32', h0, [1, 32, 256, 256]),
    high_res_feats_1: new ort.Tensor('float32', h1, [1, 64, 128, 128]),
    mask_input: new ort.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256]),
    has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1])
  }
  const dout = await dec.run(feeds)
  await idle(useGpu)
  const scores = [...(await copyT(dout.iou_predictions))].slice(0, 3)
  const masks = await copyT(dout.masks)
  const dims = dout.masks.dims
  return {
    masks,
    scores,
    mh: Number(dims[dims.length - 2]),
    mw: Number(dims[dims.length - 1]),
    threshold: 0
  }
}

window.__runHarness = async function runHarness() {
  const model = await (await fetch('bench://app/model.json')).json()
  const useGpu = model.forceBackend === 'webgpu'
  const result = {
    id: model.id,
    family: model.family,
    variant: model.variant,
    backend: model.forceBackend,
    ok: false,
    prompts: {}
  }
  await window.sam3Api.vramStart()
  let enc
  let dec
  try {
    ort.env.logLevel = 'warning'
    ort.env.wasm.wasmPaths = 'bench://app/ort/'
    ort.env.wasm.numThreads = useGpu ? 1 : Math.min(4, navigator.hardwareConcurrency || 4)
    if (useGpu) {
      if (!navigator.gpu) throw new Error('no gpu')
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      if (!adapter) throw new Error('no adapter')
      result.shaderF16 = [...adapter.features].includes('shader-f16')
      if (model.quantization === 'fp16' && !result.shaderF16) throw new Error('shader-f16 missing')
      ort.env.webgpu.adapter = adapter
      ort.env.webgpu.powerPreference = 'high-performance'
    }

    const encBuf = await (await fetch('bench://app/models/encoder')).arrayBuffer()
    const decBuf = await (await fetch('bench://app/models/decoder')).arrayBuffer()
    log(`${model.id} ${model.forceBackend} enc=${(encBuf.byteLength / 1e6).toFixed(0)}MB`)

    const imgRes = await fetch('bench://app/fixture.png')
    const bmp = await createImageBitmap(await imgRes.blob())
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    const ctx = c.getContext('2d')
    ctx.drawImage(bmp, 0, 0)
    const idata = ctx.getImageData(0, 0, c.width, c.height)
    bmp.close()
    const image = { data: idata.data, width: c.width, height: c.height, W: c.width, H: c.height }
    log(`image ${c.width}x${c.height}`)

    const gtTxt = await (await fetch('bench://app/fixture.txt')).text()
    const gt = parseGtPolygon(gtTxt)
    const prompts = derivePrompts(gt)
    const gtMask = rasterizePolygon(gt.polygon, c.width, c.height)
    const gtArea = gtMask.reduce((a, b) => a + b, 0) / gtMask.length
    result.gt = {
      bbox: gt.bbox,
      center: gt.center,
      area: gtArea,
      neg: prompts.pos_neg.points[1]
    }
    log(
      `gt bbox=[${gt.bbox.x1.toFixed(3)},${gt.bbox.y1.toFixed(3)},${gt.bbox.x2.toFixed(3)},${gt.bbox.y2.toFixed(3)}] area=${(gtArea * 100).toFixed(3)}%`
    )


    const ep = useGpu ? [{ name: 'webgpu', preferredLayout: 'NCHW' }] : ['wasm']
    const encOpts = {
      executionProviders: ep,
      ...(model.quantization === 'fp16' || model.encoderKey?.endsWith('.ort')
        ? { graphOptimizationLevel: 'disabled' }
        : {})
    }
    const t0 = performance.now()
    enc = await ort.InferenceSession.create(encBuf, encOpts)
    dec = await ort.InferenceSession.create(decBuf, { executionProviders: ep })
    if (useGpu) await hook()
    result.loadMs = performance.now() - t0

    lastErr = null
    const t1 = performance.now()
    const emb = await encode(model, enc, image, useGpu)
    result.encodeMs = performance.now() - t1

    for (const [name, prompt] of Object.entries(prompts)) {
      const t2 = performance.now()
      try {
        const decOut = await decodePrompt(model, dec, emb, image, prompt, useGpu)
        const mode = model.family === 'sam3' ? 'stretch' : 'letterbox'
        const scored = scoreResult(
          decOut.masks,
          decOut.scores,
          decOut.mh,
          decOut.mw,
          gtMask,
          c.height,
          c.width,
          decOut.threshold,
          mode
        )
        const note =
          scored.bestIou >= 0.5 ? 'good✓' : scored.bestIou >= 0.2 ? 'mid' : 'bad✗'
        result.prompts[name] = {
          ok: true,
          decodeMs: performance.now() - t2,
          ...scored,
          note
        }
        log(
          `${name}: best=${scored.best} iou=${scored.bestIou.toFixed(3)} maxIou=${scored.maxIou.toFixed(3)} areas=[${scored.areas.map((a) => (a * 100).toFixed(2) + '%').join(',')}] ${note}`
        )
      } catch (e) {
        result.prompts[name] = {
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        }
        log(`${name}: FAIL ${result.prompts[name].error}`)
      }
    }
    result.ok = Object.values(result.prompts).some((p) => p.ok)
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e)
    log(`ERROR ${result.error}`)
  } finally {
    result.vram = await window.sam3Api.vramStop()
    try {
      await enc?.release()
      await dec?.release()
    } catch {
      /* ignore */
    }
  }
  return result
}

log('harness ready')
await window.sam3Api.ready()
