import * as ort from 'bench://app/ort/ort.all.min.mjs'

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


function areasFromMasks(masks, num, mh, mw, threshold = 0) {
  const areas = []
  for (let i = 0; i < num; i++) {
    let p = 0
    const off = i * mh * mw
    for (let j = 0; j < mh * mw; j++) if (masks[off + j] > threshold) p++
    areas.push(p / (mh * mw))
  }
  return areas
}

async function loadLang() {
  const mask = new Uint8Array(32)
  mask[0] = 1
  mask[1] = 1
  mask[2] = 1
  // Better: import from relative path served by protocol - we'll embed minimal via window
  if (window.__LANG) return window.__LANG
  return { mask, feat: new Float32Array(32 * 256) }
}

window.__runPcb = async function runPcb() {
  const model = await (await fetch('bench://app/model.json')).json()
  const result = {
    id: model.id,
    family: model.family,
    variant: model.variant,
    ok: false
  }
  await window.sam3Api.vramStart()
  let enc
  let dec
  const useGpu = !!model.requiresWebGPU
  result.backend = useGpu ? 'webgpu' : 'wasm'
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
    log(`${model.id} enc=${(encBuf.byteLength / 1e6).toFixed(0)}MB dec=${(decBuf.byteLength / 1e6).toFixed(1)}MB`)

    const imgRes = await fetch('bench://app/fixture.png')
    const bmp = await createImageBitmap(await imgRes.blob())
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    const ctx = c.getContext('2d')
    ctx.drawImage(bmp, 0, 0)
    const id = ctx.getImageData(0, 0, c.width, c.height)
    bmp.close()
    const image = {
      data: id.data,
      width: c.width,
      height: c.height,
      click: { x: c.width * 0.32, y: c.height * 0.4 }
    }
    log(`fixture ${c.width}x${c.height}`)

    const ep = useGpu ? [{ name: 'webgpu' }] : ['wasm']
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
    let scores
    let areas
    let best

    if (model.family === 'sam3') {
      const tensor = stretchFloat(image, 1008, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5])
      const eout = await enc.run({
        pixel_values: new ort.Tensor('float32', tensor, [1, 3, 1008, 1008])
      })
      await idle(useGpu)
      result.encodeMs = performance.now() - t1
      const e0 = await copyT(eout['image_embeddings.0'])
      const e1 = await copyT(eout['image_embeddings.1'])
      const e2 = await copyT(eout['image_embeddings.2'])
      const mx = image.click.x * (1008 / image.width)
      const my = image.click.y * (1008 / image.height)
      const dout = await dec.run({
        input_points: new ort.Tensor('float32', new Float32Array([mx, my]), [1, 1, 1, 2]),
        input_labels: new ort.Tensor('int64', BigInt64Array.from([1n]), [1, 1, 1]),
        input_boxes: new ort.Tensor('float32', new Float32Array(0), [1, 0, 4]),
        'image_embeddings.0': new ort.Tensor('float32', e0, eout['image_embeddings.0'].dims),
        'image_embeddings.1': new ort.Tensor('float32', e1, eout['image_embeddings.1'].dims),
        'image_embeddings.2': new ort.Tensor('float32', e2, eout['image_embeddings.2'].dims)
      })
      await idle(useGpu)
      result.decodeMs = performance.now() - t1 - result.encodeMs
      const iou = await copyT(dout.iou_scores)
      // [1,1,3]
      scores = [...iou].slice(0, 3)
      const masks = await copyT(dout.pred_masks)
      const dims = dout.pred_masks.dims
      const mh = Number(dims[dims.length - 2])
      const mw = Number(dims[dims.length - 1])
      areas = areasFromMasks(masks, 3, mh, mw, 0)
      best = scores.indexOf(Math.max(...scores))
    } else if (model.family === 'sam-hq') {
      const { tensor, scale } = letterboxFloat(
        image,
        1024,
        [0.485, 0.456, 0.406],
        [0.229, 0.224, 0.225]
      )
      const eout = await enc.run({
        input_image: new ort.Tensor('float32', tensor, [1, 3, 1024, 1024])
      })
      await idle(useGpu)
      result.encodeMs = performance.now() - t1
      const ie = await copyT(eout.image_embeddings)
      const interm = await copyT(eout.interm_embeddings)
      const intermDims = model.intermDims || inferInterm(interm.length)
      const mx = image.click.x * scale
      const my = image.click.y * scale
      const dout = await dec.run({
        image_embeddings: new ort.Tensor('float32', ie, [1, 256, 64, 64]),
        interm_embeddings: new ort.Tensor('float32', interm, intermDims),
        point_coords: new ort.Tensor('float32', new Float32Array([mx, my]), [1, 1, 2]),
        point_labels: new ort.Tensor('float32', new Float32Array([1]), [1, 1]),
        mask_input: new ort.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256]),
        has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1]),
        orig_im_size: new ort.Tensor(
          'float32',
          new Float32Array([image.height, image.width]),
          [2]
        )
      })
      await idle(useGpu)
      result.decodeMs = performance.now() - t1 - result.encodeMs
      const sc = await copyT(dout.iou_predictions)
      scores = [sc[0] ?? 0]
      const masks = await copyT(dout.masks)
      const dims = dout.masks.dims
      const mh = Number(dims[dims.length - 2])
      const mw = Number(dims[dims.length - 1])
      areas = areasFromMasks(masks, 1, mh, mw, 0)
      best = 0
    } else if (model.family === 'edgesam') {
      const { tensor, scale } = letterboxFloat(
        image,
        1024,
        [0.485, 0.456, 0.406],
        [0.229, 0.224, 0.225]
      )
      const eout = await enc.run({
        image: new ort.Tensor('float32', tensor, [1, 3, 1024, 1024])
      })
      await idle(useGpu)
      result.encodeMs = performance.now() - t1
      const ie = await copyT(eout.image_embeddings)
      const mx = image.click.x * scale
      const my = image.click.y * scale
      const dout = await dec.run({
        image_embeddings: new ort.Tensor('float32', ie, [1, 256, 64, 64]),
        point_coords: new ort.Tensor('float32', new Float32Array([mx, my]), [1, 1, 2]),
        point_labels: new ort.Tensor('float32', new Float32Array([1]), [1, 1])
      })
      await idle(useGpu)
      result.decodeMs = performance.now() - t1 - result.encodeMs
      const sc = await copyT(dout.scores)
      scores = [sc[0] ?? 0]
      const masks = await copyT(dout.masks)
      const dims = dout.masks.dims
      const mh = Number(dims[dims.length - 2])
      const mw = Number(dims[dims.length - 1])
      areas = areasFromMasks(masks, 1, mh, mw, 0)
      best = 0
    } else {
      // sam2.1
      const { tensor, scale } = letterboxFloat(
        image,
        1024,
        [0.485, 0.456, 0.406],
        [0.229, 0.224, 0.225]
      )
      const eout = await enc.run({
        image: new ort.Tensor('float32', tensor, [1, 3, 1024, 1024])
      })
      await idle(useGpu)
      result.encodeMs = performance.now() - t1
      const ie = await copyT(eout.image_embed)
      const h0 = await copyT(eout.high_res_feats_0)
      const h1 = await copyT(eout.high_res_feats_1)
      const mx = image.click.x * scale
      const my = image.click.y * scale
      const dout = await dec.run({
        point_coords: new ort.Tensor('float32', new Float32Array([mx, my]), [1, 1, 2]),
        point_labels: new ort.Tensor('float32', new Float32Array([1]), [1, 1]),
        image_embed: new ort.Tensor('float32', ie, [1, 256, 64, 64]),
        high_res_feats_0: new ort.Tensor('float32', h0, [1, 32, 256, 256]),
        high_res_feats_1: new ort.Tensor('float32', h1, [1, 64, 128, 128]),
        mask_input: new ort.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256]),
        has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1])
      })
      await idle(useGpu)
      result.decodeMs = performance.now() - t1 - result.encodeMs
      scores = [...(await copyT(dout.iou_predictions))].slice(0, 3)
      const masks = await copyT(dout.masks)
      const dims = dout.masks.dims
      const mh = Number(dims[dims.length - 2])
      const mw = Number(dims[dims.length - 1])
      areas = areasFromMasks(masks, 3, mh, mw, 0)
      best = scores.indexOf(Math.max(...scores))
    }

    log(
      `scores=[${scores.map((s) => (Number.isFinite(s) ? s.toFixed(3) : 'nan')).join(',')}] best=${best} areas=[${areas.map((a) => a.toFixed(4)).join(',')}]`
    )
    result.scores = scores
    result.best = best
    result.areas = areas
    result.ok = true
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

function inferInterm(len) {
  const cands = [
    [1, 1, 64, 64, 160],
    [4, 1, 64, 64, 768],
    [4, 1, 64, 64, 1024]
  ]
  for (const d of cands) if (d.reduce((a, b) => a * b, 1) === len) return d
  throw new Error(`unknown interm len ${len}`)
}

log('pcb probe ready')
await window.sam3Api.ready()
