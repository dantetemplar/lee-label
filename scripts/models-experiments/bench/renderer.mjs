import * as ort from 'bench://app/ort/ort.all.min.mjs'

const IMAGE_MEAN = [0.485, 0.456, 0.406]
const IMAGE_STD = [0.229, 0.224, 0.225]
const MODEL_SIZE = 1024

const logEl = document.getElementById('log')
function log(msg) {
  logEl.textContent += `\n${msg}`
  void window.benchApi.log(msg)
}

/** Obvious synthetic scene: blue bg + red circle. Click center → mask should cover circle. */
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
  const imageData = ctx.getImageData(0, 0, size, size)
  return {
    data: imageData.data,
    width: size,
    height: size,
    click: { x: size / 2, y: size / 2 }
  }
}

function preprocess(imageData) {
  const { width: w, height: h, data } = imageData
  const scale = MODEL_SIZE / Math.max(w, h)
  const newW = Math.round(w * scale)
  const newH = Math.round(h * scale)

  const src = new OffscreenCanvas(w, h)
  const sctx = src.getContext('2d')
  sctx.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0)

  const dst = new OffscreenCanvas(MODEL_SIZE, MODEL_SIZE)
  const dctx = dst.getContext('2d')
  dctx.drawImage(src, 0, 0, newW, newH)
  const resized = dctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE)
  const pixels = resized.data
  const total = MODEL_SIZE * MODEL_SIZE
  const tensor = new Float32Array(3 * total)
  for (let i = 0; i < total; i++) {
    const rgba = i * 4
    for (let c = 0; c < 3; c++) {
      const val = pixels[rgba + c] / 255
      tensor[c * total + i] = (val - IMAGE_MEAN[c]) / IMAGE_STD[c]
    }
  }
  return tensor
}

function toModelCoords(x, y, w, h) {
  const scale = MODEL_SIZE / Math.max(w, h)
  return [x * scale, y * scale]
}

function copyF32(data) {
  return data instanceof Float32Array ? new Float32Array(data) : Float32Array.from(data)
}

async function copyTensorData(tensor) {
  if (typeof tensor.getData === 'function') {
    const downloaded = await tensor.getData()
    return downloaded instanceof Float32Array
      ? new Float32Array(downloaded)
      : Float32Array.from(downloaded)
  }
  const raw = tensor.data
  if (raw instanceof Float32Array) return new Float32Array(raw)
  return Float32Array.from(raw)
}

async function encode(session, family, image) {
  const input = preprocess(image)
  const dims = [1, 3, MODEL_SIZE, MODEL_SIZE]

  if (family === 'sam-hq') {
    const results = await session.encoder.run({
      input_image: new ort.Tensor('float32', input, dims)
    })
    return {
      type: 'sam-hq',
      imageEmbeddings: await copyTensorData(results.image_embeddings),
      intermEmbeddings: await copyTensorData(results.interm_embeddings)
    }
  }
  if (family === 'edgesam') {
    const results = await session.encoder.run({
      image: new ort.Tensor('float32', input, dims)
    })
    return { type: 'edgesam', imageEmbeddings: await copyTensorData(results.image_embeddings) }
  }
  // sam2 / sam2.1
  const results = await session.encoder.run({
    image: new ort.Tensor('float32', input, dims)
  })
  return {
    type: 'sam2',
    imageEmbed: await copyTensorData(results.image_embed),
    highResFeats0: await copyTensorData(results.high_res_feats_0),
    highResFeats1: await copyTensorData(results.high_res_feats_1)
  }
}

async function decode(session, family, model, embedding, image, click) {
  const [mx, my] = toModelCoords(click.x, click.y, image.width, image.height)
  const points = new Float32Array([mx, my])
  const labels = new Float32Array([1])
  const emptyMask = new Float32Array(256 * 256)

  if (family === 'sam-hq' && embedding.type === 'sam-hq') {
    const intermDims = model.intermDims
    const results = await session.decoder.run({
      image_embeddings: new ort.Tensor('float32', embedding.imageEmbeddings, [1, 256, 64, 64]),
      interm_embeddings: new ort.Tensor('float32', embedding.intermEmbeddings, intermDims),
      point_coords: new ort.Tensor('float32', points, [1, 1, 2]),
      point_labels: new ort.Tensor('float32', labels, [1, 1]),
      mask_input: new ort.Tensor('float32', emptyMask, [1, 1, 256, 256]),
      has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1]),
      orig_im_size: new ort.Tensor(
        'float32',
        new Float32Array([image.height, image.width]),
        [2]
      )
    })
    const mask = await copyTensorData(results.masks)
    const score = (await copyTensorData(results.iou_predictions))[0] ?? 0
    const dims = results.masks.dims
    return {
      score,
      maskW: Number(dims[dims.length - 1]),
      maskH: Number(dims[dims.length - 2]),
      mask
    }
  }

  if (family === 'edgesam' && embedding.type === 'edgesam') {
    const results = await session.decoder.run({
      image_embeddings: new ort.Tensor('float32', embedding.imageEmbeddings, [1, 256, 64, 64]),
      point_coords: new ort.Tensor('float32', points, [1, 1, 2]),
      point_labels: new ort.Tensor('float32', labels, [1, 1])
    })
    const mask = await copyTensorData(results.masks)
    const score = (await copyTensorData(results.scores))[0] ?? 0
    const dims = results.masks.dims
    return {
      score,
      maskW: Number(dims[dims.length - 1]),
      maskH: Number(dims[dims.length - 2]),
      mask
    }
  }

  const results = await session.decoder.run({
    point_coords: new ort.Tensor('float32', points, [1, 1, 2]),
    point_labels: new ort.Tensor('float32', labels, [1, 1]),
    image_embed: new ort.Tensor('float32', embedding.imageEmbed, [1, 256, 64, 64]),
    high_res_feats_0: new ort.Tensor('float32', embedding.highResFeats0, [1, 32, 256, 256]),
    high_res_feats_1: new ort.Tensor('float32', embedding.highResFeats1, [1, 64, 128, 128]),
    mask_input: new ort.Tensor('float32', emptyMask, [1, 1, 256, 256]),
    has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1])
  })
  const mask = await copyTensorData(results.masks)
  const scores = await copyTensorData(results.iou_predictions)
  const dims = results.masks.dims
  const maskW = Number(dims[dims.length - 1])
  const maskH = Number(dims[dims.length - 2])
  return pickSam2Mask(mask, scores, maskW, maskH, image, click)
}

function pickSam2Mask(rawMasks, rawScores, maskWidth, maskHeight, image, click) {
  const outputWidth = image.width
  const outputHeight = image.height
  const totalPixelsPerMask = maskWidth * maskHeight
  const numMasks = Math.max(1, Math.floor(rawMasks.length / totalPixelsPerMask))
  const maskScaleX = maskWidth / Math.max(outputWidth, outputHeight)
  const maskScaleY = maskHeight / Math.max(outputWidth, outputHeight)

  let bestIdx = 0
  let bestScore = -Infinity
  for (let i = 0; i < numMasks; i++) {
    const score = rawScores[i] ?? 0
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }

  const outputPixels = outputWidth * outputHeight
  const logits = new Float32Array(outputPixels)

  function planeMask(i) {
    const maskOffset = i * totalPixelsPerMask
    for (let y = 0; y < outputHeight; y++) {
      for (let x = 0; x < outputWidth; x++) {
        const srcX = Math.min(maskWidth - 1, Math.floor(x * maskScaleX))
        const srcY = Math.min(maskHeight - 1, Math.floor(y * maskScaleY))
        logits[y * outputWidth + x] = rawMasks[maskOffset + srcY * maskWidth + srcX] ?? 0
      }
    }
    return logits
  }

  const masksAtOutput = []
  for (let i = 0; i < numMasks; i++) masksAtOutput.push(planeMask(i))

  let containingBestIdx = -1
  let containingBestScore = -Infinity
  for (let i = 0; i < numMasks; i++) {
    const score = rawScores[i] ?? -Infinity
    if (score <= containingBestScore) continue
    if (!centerOnMask(masksAtOutput[i], outputWidth, outputHeight, image, click)) continue
    containingBestScore = score
    containingBestIdx = i
  }
  if (containingBestIdx >= 0) bestIdx = containingBestIdx

  return {
    score: rawScores[bestIdx] ?? 0,
    maskW: outputWidth,
    maskH: outputHeight,
    mask: masksAtOutput[bestIdx],
    numMasks,
    rawMaskW: maskWidth,
    rawMaskH: maskHeight
  }
}

/** Fraction of circle pixels (red in source) that are positive in the mask. */
function circleCoverage(image, mask, maskW, maskH, threshold = 0) {
  const { width, height, data } = image
  let circle = 0
  let hit = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const isRed = data[i] > 180 && data[i + 2] < 100
      if (!isRed) continue
      circle++
      const sx = x
      const sy = y
      if (mask[sy * maskW + sx] > threshold) hit++
    }
  }
  return circle === 0 ? 0 : hit / circle
}

function centerOnMask(mask, maskW, maskH, image, click, threshold = 0) {
  const sx = Math.min(maskW - 1, Math.round(click.x))
  const sy = Math.min(maskH - 1, Math.round(click.y))
  return mask[sy * maskW + sx] > threshold
}

function sessionOptions(variant, useWebGPU, preoptimizedEncoder) {
  const ep = useWebGPU ? [{ name: 'webgpu', preferredLayout: 'NCHW' }] : ['wasm']
  const base = { executionProviders: ep }

  if (variant === 'opt-all') {
    return {
      encoder: { ...base, graphOptimizationLevel: 'all' },
      decoder: { ...base, graphOptimizationLevel: 'all' }
    }
  }
  if (variant === 'gpu-io') {
    return {
      encoder: {
        ...base,
        graphOptimizationLevel: preoptimizedEncoder ? 'disabled' : 'all',
        preferredOutputLocation: 'gpu-buffer'
      },
      decoder: { ...base, preferredOutputLocation: 'gpu-buffer' }
    }
  }
  if (variant === 'graph-capture') {
    return {
      encoder: {
        ...base,
        graphOptimizationLevel: preoptimizedEncoder ? 'disabled' : 'all',
        enableGraphCapture: true
      },
      decoder: { ...base, enableGraphCapture: true }
    }
  }
  // .ort / fused/fp16 .onnx: disable graph opts (strict shape merge breaks fp16).
  return {
    encoder: { ...base, ...(preoptimizedEncoder ? { graphOptimizationLevel: 'disabled' } : {}) },
    decoder: { ...base }
  }
}

let lastWebGpuError = null

async function hookWebGpuErrors() {
  const raw = ort.env.webgpu?.device
  if (!raw) return
  const device = raw instanceof Promise ? await raw : raw
  if (!device) return
  lastWebGpuError = null
  device.addEventListener('uncapturederror', (event) => {
    const msg = event.error?.message || 'WebGPU validation error'
    lastWebGpuError = new Error(msg)
  })
  void device.lost.then((info) => {
    lastWebGpuError = new Error(`WebGPU device lost: ${info.message}`)
  })
}

function throwIfWebGpuError(context) {
  if (!lastWebGpuError) return
  const err = lastWebGpuError
  lastWebGpuError = null
  throw new Error(`${context}: ${err.message}`, { cause: err })
}

async function waitGpuIdle() {
  const raw = ort.env.webgpu?.device
  if (!raw) return
  const device = raw instanceof Promise ? await raw : raw
  if (device?.queue?.onSubmittedWorkDone) {
    await device.queue.onSubmittedWorkDone()
  }
  throwIfWebGpuError('after GPU submit')
}

async function configureOrt(useWebGPU) {
  ort.env.logLevel = 'warning'
  ort.env.wasm.wasmPaths = 'bench://app/ort/'
  if (useWebGPU) {
    ort.env.wasm.numThreads = 1
    if (navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
        if (adapter) ort.env.webgpu.adapter = adapter
        ort.env.webgpu.powerPreference = 'high-performance'
      } catch {
        /* ignore */
      }
    }
  } else {
    ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4
  }
}

async function runBench(modelId) {
  const config = await window.benchApi.getConfig()
  const { model, encoderBuffer, decoderBuffer } = await window.benchApi.readModel(modelId)
  const image = makeTestImage(config.imageSize)
  const useWebGPU = !!model.requiresWebGPU
  const isOrtEncoder = model.encoderKey.endsWith('.ort')
  const preoptimizedEncoder = isOrtEncoder || model.encoderKey.endsWith('.onnx')
  const opts = sessionOptions(config.variant, useWebGPU, preoptimizedEncoder)

  const result = {
    id: modelId,
    family: model.family,
    backend: useWebGPU ? 'webgpu' : 'wasm',
    variant: config.variant,
    ok: false
  }

  await window.benchApi.vramStart()
  let encoder
  let decoder
  try {
    await configureOrt(useWebGPU)
    if (useWebGPU && navigator.gpu) {
      try {
        const adapter = ort.env.webgpu?.adapter || (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }))
        const feats = adapter?.features ? [...adapter.features] : []
        log(`WebGPU shader-f16=${feats.includes('shader-f16')} features=${feats.join(',') || '(empty)'}`)
        result.shaderF16 = feats.includes('shader-f16')
      } catch (e) {
        log(`WebGPU feature probe failed: ${e}`)
      }
    }

    const t0 = performance.now()
    encoder = await ort.InferenceSession.create(encoderBuffer, opts.encoder)
    decoder = await ort.InferenceSession.create(decoderBuffer, opts.decoder)
    if (useWebGPU) await hookWebGpuErrors()
    result.loadMs = performance.now() - t0

    // Warmup encode once for fair-ish timings (skip counting)
    try {
      await encode({ encoder, decoder }, model.family, image)
      if (useWebGPU) await waitGpuIdle()
    } catch {
      /* first run may fail on some variants; timed run reports real error */
    }
    lastWebGpuError = null

    const t1 = performance.now()
    const embedding = await encode({ encoder, decoder }, model.family, image)
    if (useWebGPU) await waitGpuIdle()
    result.encodeMs = performance.now() - t1

    const t2 = performance.now()
    const decoded = await decode(
      { encoder, decoder },
      model.family,
      model,
      embedding,
      image,
      image.click
    )
    if (useWebGPU) await waitGpuIdle()
    result.segmentMs = performance.now() - t2
    result.score = decoded.score
    result.centerHit = centerOnMask(decoded.mask, decoded.maskW, decoded.maskH, image, image.click)
    result.centerCoverage = circleCoverage(image, decoded.mask, decoded.maskW, decoded.maskH)
    // Pass if click is in mask and most of the red circle is covered
    result.ok = result.centerHit && result.centerCoverage >= 0.5
    if (!result.ok) {
      result.error = `quality fail: centerHit=${result.centerHit} coverage=${(result.centerCoverage * 100).toFixed(1)}% numMasks=${decoded.numMasks ?? 1} raw=${decoded.rawMaskW ?? decoded.maskW}x${decoded.rawMaskH ?? decoded.maskH}`
    }
  } catch (err) {
    result.ok = false
    result.error = err instanceof Error ? err.message : String(err)
  } finally {
    result.vram = await window.benchApi.vramStop()
    try {
      await encoder?.release()
      await decoder?.release()
    } catch {
      /* ignore */
    }
  }

  return result
}

window.__runBench = runBench
log(`ORT ready, webgpu=${!!navigator.gpu}`)
if (navigator.gpu) {
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    const f16 = !!adapter?.features?.has('shader-f16')
    log(`WebGPU shader-f16=${f16} features=${adapter ? [...adapter.features].join(',') : 'none'}`)
  } catch (e) {
    log(`WebGPU probe failed: ${e}`)
  }
}
await window.benchApi.ready()
