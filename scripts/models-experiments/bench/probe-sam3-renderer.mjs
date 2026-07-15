import * as ort from 'bench://app/ort/ort.all.min.mjs'

const MODEL_SIZE = 1008
const logEl = document.getElementById('log')
function log(msg) {
  logEl.textContent += `\n${msg}`
  void window.sam3Api.log(msg)
}

function makeTestImage(size = 512) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#1a4d8c'
  ctx.fillRect(0, 0, size, size)
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.28, 0, Math.PI * 2)
  ctx.fillStyle = '#e63946'
  ctx.fill()
  return {
    data: ctx.getImageData(0, 0, size, size).data,
    width: size,
    height: size,
    click: { x: size / 2, y: size / 2 }
  }
}

function preprocess(image) {
  const src = new OffscreenCanvas(image.width, image.height)
  const sctx = src.getContext('2d')
  sctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
  const dst = new OffscreenCanvas(MODEL_SIZE, MODEL_SIZE)
  const dctx = dst.getContext('2d')
  dctx.drawImage(src, 0, 0, MODEL_SIZE, MODEL_SIZE)
  const pixels = dctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data
  const total = MODEL_SIZE * MODEL_SIZE
  const tensor = new Float32Array(3 * total)
  const mean = [0.5, 0.5, 0.5]
  const std = [0.5, 0.5, 0.5]
  for (let i = 0; i < total; i++) {
    const rgba = i * 4
    for (let c = 0; c < 3; c++) {
      const val = pixels[rgba + c] / 255
      tensor[c * total + i] = (val - mean[c]) / std[c]
    }
  }
  return tensor
}

async function copyTensorData(tensor) {
  if (typeof tensor.getData === 'function') {
    const downloaded = await tensor.getData()
    return downloaded instanceof Float32Array
      ? new Float32Array(downloaded)
      : Float32Array.from(downloaded)
  }
  const data = tensor.data
  return data instanceof Float32Array ? new Float32Array(data) : Float32Array.from(data)
}

let lastWebGpuError = null
async function hookWebGpuErrors() {
  const raw = ort.env.webgpu?.device
  if (!raw) return
  const device = raw instanceof Promise ? await raw : raw
  if (!device) return
  lastWebGpuError = null
  device.addEventListener('uncapturederror', (event) => {
    lastWebGpuError = new Error(event.error?.message || 'WebGPU validation error')
  })
}

function throwIfWebGpuError(ctx) {
  if (!lastWebGpuError) return
  const err = lastWebGpuError
  lastWebGpuError = null
  throw new Error(`${ctx}: ${err.message}`, { cause: err })
}

async function waitGpuIdle() {
  const raw = ort.env.webgpu?.device
  if (!raw) return
  const device = raw instanceof Promise ? await raw : raw
  if (device?.queue?.onSubmittedWorkDone) await device.queue.onSubmittedWorkDone()
  throwIfWebGpuError('after GPU submit')
}

async function loadFixtureOrSynthetic() {
  try {
    const imgRes = await fetch('bench://app/fixture.png')
    if (imgRes.ok) {
      const blob = await imgRes.blob()
      const bmp = await createImageBitmap(blob)
      const c = document.createElement('canvas')
      c.width = bmp.width
      c.height = bmp.height
      const ctx = c.getContext('2d')
      ctx.drawImage(bmp, 0, 0)
      const id = ctx.getImageData(0, 0, c.width, c.height)
      const image = {
        data: id.data,
        width: c.width,
        height: c.height,
        click: { x: c.width * 0.32, y: c.height * 0.4 }
      }
      bmp.close()
      log(`fixture ${c.width}x${c.height} click=(${image.click.x.toFixed(0)},${image.click.y.toFixed(0)})`)
      return image
    }
  } catch {
    /* fall through */
  }
  log('using synthetic test image')
  return makeTestImage(512)
}

window.__runSam3 = async function runSam3() {
  const mode = new URLSearchParams(location.search).get('mode') || 'hybrid-wasm-enc'
  const result = {
    ok: false,
    family: 'sam3-tracker',
    mode,
    mix: mode.includes('q4') ? 'q4_enc+fp32_dec' : 'fp16_enc+fp32_dec'
  }
  await window.sam3Api.vramStart()
  let encoder
  let decoder
  try {
    ort.env.logLevel = 'warning'
    ort.env.wasm.wasmPaths = 'bench://app/ort/'
    ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 4)

    const useGpuEnc = mode === 'gpu-seq-q4' || mode === 'gpu-seq-fp16' || mode === 'gpu-both-fp16'
    const useGpuDec = mode !== 'wasm-both'
    if (useGpuEnc || useGpuDec) {
      if (!navigator.gpu) throw new Error('no navigator.gpu')
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      if (!adapter) throw new Error('no adapter')
      const feats = [...adapter.features]
      result.shaderF16 = feats.includes('shader-f16')
      log(`shader-f16=${result.shaderF16}`)
      if (!result.shaderF16) throw new Error('shader-f16 missing')
      ort.env.webgpu.adapter = adapter
      ort.env.webgpu.powerPreference = 'high-performance'
    }

    const encUrl = mode.includes('q4')
      ? 'bench://app/models/encoder.q4.onnx'
      : 'bench://app/models/encoder.fp16.onnx'
    const encRes = await fetch(encUrl)
    const decRes = await fetch('bench://app/models/decoder.fp32.onnx')
    if (!encRes.ok || !decRes.ok) {
      throw new Error(`fetch models failed enc=${encRes.status} dec=${decRes.status}`)
    }
    const encoderBuffer = await encRes.arrayBuffer()
    const decoderBuffer = await decRes.arrayBuffer()
    log(
      `mode=${mode} enc=${(encoderBuffer.byteLength / 1e6).toFixed(0)}MB dec=${(decoderBuffer.byteLength / 1e6).toFixed(1)}MB`
    )

    const image = await loadFixtureOrSynthetic()
    const pixelValues = preprocess(image)
    const feeds = {
      pixel_values: new ort.Tensor('float32', pixelValues, [1, 3, MODEL_SIZE, MODEL_SIZE])
    }

    const encEp = useGpuEnc ? [{ name: 'webgpu' }] : ['wasm']
    const decEp = useGpuDec ? [{ name: 'webgpu' }] : ['wasm']
    const encOpts = {
      executionProviders: encEp,
      graphOptimizationLevel: 'disabled'
    }
    const decOpts = { executionProviders: decEp }

    const t0 = performance.now()
    log(`create encoder (${useGpuEnc ? 'webgpu' : 'wasm'})…`)
    encoder = await ort.InferenceSession.create(encoderBuffer, encOpts)
    if (useGpuEnc) await hookWebGpuErrors()

    // Sequential: encode first; for gpu-seq* do not create decoder until encoder released.
    const createDecoderEarly = mode === 'gpu-both-fp16' || mode === 'wasm-both' || mode === 'hybrid-wasm-enc'
    if (createDecoderEarly) {
      log(`create decoder (${useGpuDec ? 'webgpu' : 'wasm'})…`)
      decoder = await ort.InferenceSession.create(decoderBuffer, decOpts)
      if (useGpuDec) await hookWebGpuErrors()
    }
    result.loadMs = performance.now() - t0

    log('encode…')
    lastWebGpuError = null
    const t2 = performance.now()
    const encOut = await encoder.run(feeds)
    if (useGpuEnc) await waitGpuIdle()
    result.encodeMs = performance.now() - t2

    const e0t = encOut['image_embeddings.0']
    const e1t = encOut['image_embeddings.1']
    const e2t = encOut['image_embeddings.2']
    const e0 = await copyTensorData(e0t)
    const e1 = await copyTensorData(e1t)
    const e2 = await copyTensorData(e2t)
    const dims0 = e0t.dims
    const dims1 = e1t.dims
    const dims2 = e2t.dims
    log(`encode ${result.encodeMs.toFixed(0)}ms dims=${dims0}/${dims1}/${dims2}`)

    // Free encoder VRAM before decoder for sequential modes.
    if (!createDecoderEarly) {
      await encoder.release()
      encoder = null
      log('encoder released')
      log(`create decoder (${useGpuDec ? 'webgpu' : 'wasm'})…`)
      decoder = await ort.InferenceSession.create(decoderBuffer, decOpts)
      if (useGpuDec) await hookWebGpuErrors()
    }

    const mx = image.click.x * (MODEL_SIZE / image.width)
    const my = image.click.y * (MODEL_SIZE / image.height)
    const points = new Float32Array([mx, my])
    const labels = BigInt64Array.from([1n])
    const boxes = new Float32Array(0)

    const decFeeds = {
      input_points: new ort.Tensor('float32', points, [1, 1, 1, 2]),
      input_labels: new ort.Tensor('int64', labels, [1, 1, 1]),
      input_boxes: new ort.Tensor('float32', boxes, [1, 0, 4]),
      'image_embeddings.0': new ort.Tensor('float32', e0, dims0),
      'image_embeddings.1': new ort.Tensor('float32', e1, dims1),
      'image_embeddings.2': new ort.Tensor('float32', e2, dims2)
    }

    lastWebGpuError = null
    const t3 = performance.now()
    const decOut = await decoder.run(decFeeds)
    if (useGpuDec) await waitGpuIdle()
    result.decodeMs = performance.now() - t3

    const scores = await copyTensorData(decOut.iou_scores)
    const masks = await copyTensorData(decOut.pred_masks)
    const dims = decOut.pred_masks.dims
    const mh = Number(dims[dims.length - 2])
    const mw = Number(dims[dims.length - 1])
    const best = scores.indexOf(Math.max(...scores))
    const areas = []
    for (let i = 0; i < 3; i++) {
      let pos = 0
      const off = i * mh * mw
      for (let p = 0; p < mh * mw; p++) if (masks[off + p] > 0) pos++
      areas.push(pos / (mh * mw))
    }
    const cx = Math.min(mw - 1, Math.round((mx / MODEL_SIZE) * mw))
    const cy = Math.min(mh - 1, Math.round((my / MODEL_SIZE) * mh))
    const hit = masks[best * mh * mw + cy * mw + cx] > 0
    log(
      `decode ${result.decodeMs.toFixed(0)}ms scores=[${[...scores].map((s) => s.toFixed(3))}] best=${best} areas=[${areas.map((a) => a.toFixed(4))}] hit=${hit}`
    )

    result.scores = [...scores]
    result.best = best
    result.areas = areas
    result.hit = hit
    result.ok = true
  } catch (err) {
    result.ok = false
    result.error = err instanceof Error ? err.message : String(err)
    log(`ERROR ${result.error}`)
  } finally {
    result.vram = await window.sam3Api.vramStop()
    try {
      await encoder?.release()
      await decoder?.release()
    } catch {
      /* ignore */
    }
  }
  return result
}

log('SAM3 probe ready')
await window.sam3Api.ready()
