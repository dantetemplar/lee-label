import type { Tensor } from 'onnxruntime-web'
import { getOrt, type OnnxSession, type OrtModule } from './session'
import type { ImageEmbedding, PromptInput, MaskResult } from './types'
import { imageToModelCoords } from './image'
import { smoothMask } from './morphology'

export interface DecoderOptions {
  maskInput: Float32Array | null
  outputWidth: number
  outputHeight: number
  smoothPasses?: number
}

const LOW_RES_MASK_SIZE = 256
const NUM_MASKS = 3

export async function decodeMask(
  session: OnnxSession,
  embedding: ImageEmbedding,
  prompt: PromptInput,
  options: DecoderOptions
): Promise<MaskResult> {
  const ort = await getOrt()
  const { outputWidth, outputHeight } = options
  const family = session.model.family

  const points: [number, number][] = []
  const labels: number[] = []

  if (prompt.points && prompt.points.length > 0) {
    for (const p of prompt.points) {
      const [sx, sy] = imageToModelCoords(p.x, p.y, outputWidth, outputHeight)
      points.push([sx, sy])
      labels.push(p.label)
    }
  }

  if (prompt.box) {
    const [x1, y1] = imageToModelCoords(prompt.box.x1, prompt.box.y1, outputWidth, outputHeight)
    const [x2, y2] = imageToModelCoords(prompt.box.x2, prompt.box.y2, outputWidth, outputHeight)
    points.push([x1, y1], [x2, y2])
    labels.push(2, 3)
  }

  if (points.length === 0) {
    throw new Error('Decoder requires at least one point or box prompt')
  }

  const numPoints = points.length

  let rawMasks: Float32Array
  let rawScores: Float32Array
  let maskWidth: number
  let maskHeight: number

  if (family === 'sam1' && embedding.type === 'sam1') {
    const sam1Result = await runSam1Decoder(ort, session, embedding, points, labels, numPoints)
    rawMasks = sam1Result.masks
    rawScores = sam1Result.scores
    maskWidth = sam1Result.maskWidth
    maskHeight = sam1Result.maskHeight
  } else if (family === 'edgesam' && embedding.type === 'edgesam') {
    const edgeResult = await runEdgeSamDecoder(ort, session, embedding, points, labels, numPoints)
    rawMasks = edgeResult.masks
    rawScores = edgeResult.scores
    maskWidth = edgeResult.maskWidth
    maskHeight = edgeResult.maskHeight
  } else if (family === 'sam-hq' && embedding.type === 'sam-hq') {
    return runSamHqDecode(
      ort,
      session,
      embedding,
      points,
      labels,
      numPoints,
      options.maskInput,
      outputWidth,
      outputHeight,
      options.smoothPasses ?? 0
    )
  } else if ((family === 'sam2' || family === 'sam2.1') && embedding.type === 'sam2') {
    const sam2Result = await runSam2Decoder(
      ort,
      session,
      embedding,
      points,
      labels,
      numPoints,
      options.maskInput
    )
    rawMasks = sam2Result.masks
    rawScores = sam2Result.scores
    maskWidth = sam2Result.maskWidth
    maskHeight = sam2Result.maskHeight
  } else {
    throw new Error(`Mismatched embedding type '${embedding.type}' for model family '${family}'`)
  }

  const smoothPasses = options.smoothPasses ?? 0
  const positivePoints =
    prompt.points?.filter((p) => p.label === 1).map((p) => ({ x: p.x, y: p.y })) ?? []
  return postProcessMasks(
    rawMasks,
    rawScores,
    maskWidth,
    maskHeight,
    outputWidth,
    outputHeight,
    0.0,
    smoothPasses,
    positivePoints
  )
}

async function runSam1Decoder(
  ort: OrtModule,
  session: OnnxSession,
  embedding: Extract<ImageEmbedding, { type: 'sam1' }>,
  points: [number, number][],
  labels: number[],
  numPoints: number
): Promise<{ masks: Float32Array; scores: Float32Array; maskWidth: number; maskHeight: number }> {
  const pointsFlat = new Float32Array(numPoints * 2)
  for (let i = 0; i < numPoints; i++) {
    pointsFlat[i * 2] = points[i]![0]
    pointsFlat[i * 2 + 1] = points[i]![1]
  }

  const labelsFlat = new BigInt64Array(numPoints)
  for (let i = 0; i < numPoints; i++) {
    labelsFlat[i] = BigInt(labels[i]!)
  }

  const feeds: Record<string, Tensor> = {
    input_points: new ort.Tensor('float32', pointsFlat, [1, 1, numPoints, 2]),
    input_labels: new ort.Tensor('int64', labelsFlat, [1, 1, numPoints]),
    image_embeddings: new ort.Tensor('float32', embedding.imageEmbeddings, [1, 256, 64, 64]),
    image_positional_embeddings: new ort.Tensor(
      'float32',
      embedding.imagePositionalEmbeddings,
      [1, 256, 64, 64]
    )
  }

  let results: Awaited<ReturnType<typeof session.decoderSession.run>>
  try {
    results = await session.decoderSession.run(feeds)
  } catch (err) {
    throw new Error('SAM1 decoder inference failed', { cause: err })
  }

  const maskTensor = results.pred_masks
  const dims = maskTensor.dims
  return {
    masks: copyFloat32(maskTensor.data),
    scores: copyFloat32(results.iou_scores.data),
    maskWidth: Number(dims[dims.length - 1]),
    maskHeight: Number(dims[dims.length - 2])
  }
}

async function runEdgeSamDecoder(
  ort: OrtModule,
  session: OnnxSession,
  embedding: Extract<ImageEmbedding, { type: 'edgesam' }>,
  points: [number, number][],
  labels: number[],
  numPoints: number
): Promise<{ masks: Float32Array; scores: Float32Array; maskWidth: number; maskHeight: number }> {
  const pointsFlat = new Float32Array(numPoints * 2)
  for (let i = 0; i < numPoints; i++) {
    pointsFlat[i * 2] = points[i]![0]
    pointsFlat[i * 2 + 1] = points[i]![1]
  }

  const labelsFlat = new Float32Array(numPoints)
  for (let i = 0; i < numPoints; i++) {
    labelsFlat[i] = labels[i]!
  }

  const feeds: Record<string, Tensor> = {
    image_embeddings: new ort.Tensor('float32', embedding.imageEmbeddings, [1, 256, 64, 64]),
    point_coords: new ort.Tensor('float32', pointsFlat, [1, numPoints, 2]),
    point_labels: new ort.Tensor('float32', labelsFlat, [1, numPoints])
  }

  let results: Awaited<ReturnType<typeof session.decoderSession.run>>
  try {
    results = await session.decoderSession.run(feeds)
  } catch (err) {
    throw new Error('EdgeSAM decoder inference failed', { cause: err })
  }

  const maskTensor = results.masks
  const dims = maskTensor.dims
  return {
    masks: copyFloat32(maskTensor.data),
    scores: copyFloat32(results.scores.data),
    maskWidth: Number(dims[dims.length - 1]),
    maskHeight: Number(dims[dims.length - 2])
  }
}

async function runSam2Decoder(
  ort: OrtModule,
  session: OnnxSession,
  embedding: Extract<ImageEmbedding, { type: 'sam2' }>,
  points: [number, number][],
  labels: number[],
  numPoints: number,
  maskInput: Float32Array | null
): Promise<{ masks: Float32Array; scores: Float32Array; maskWidth: number; maskHeight: number }> {
  const pointsFlat = new Float32Array(numPoints * 2)
  for (let i = 0; i < numPoints; i++) {
    pointsFlat[i * 2] = points[i]![0]
    pointsFlat[i * 2 + 1] = points[i]![1]
  }

  const labelsFlat = new Float32Array(numPoints)
  for (let i = 0; i < numPoints; i++) {
    labelsFlat[i] = labels[i]!
  }

  const hasMask = maskInput != null
  const maskData = maskInput ?? new Float32Array(LOW_RES_MASK_SIZE * LOW_RES_MASK_SIZE)

  const feeds: Record<string, Tensor> = {
    point_coords: new ort.Tensor('float32', pointsFlat, [1, numPoints, 2]),
    point_labels: new ort.Tensor('float32', labelsFlat, [1, numPoints]),
    image_embed: new ort.Tensor('float32', embedding.imageEmbed, [1, 256, 64, 64]),
    high_res_feats_0: new ort.Tensor('float32', embedding.highResFeats0, [1, 32, 256, 256]),
    high_res_feats_1: new ort.Tensor('float32', embedding.highResFeats1, [1, 64, 128, 128]),
    mask_input: new ort.Tensor('float32', maskData, [1, 1, LOW_RES_MASK_SIZE, LOW_RES_MASK_SIZE]),
    has_mask_input: new ort.Tensor('float32', new Float32Array([hasMask ? 1.0 : 0.0]), [1])
  }

  let results: Awaited<ReturnType<typeof session.decoderSession.run>>
  try {
    results = await session.decoderSession.run(feeds)
  } catch (err) {
    throw new Error('SAM2 decoder inference failed', { cause: err })
  }

  const maskTensor = results.masks
  const dims = maskTensor.dims
  return {
    masks: copyFloat32(maskTensor.data),
    scores: copyFloat32(results.iou_predictions.data),
    maskWidth: Number(dims[dims.length - 1]),
    maskHeight: Number(dims[dims.length - 2])
  }
}

async function runSamHqDecode(
  ort: OrtModule,
  session: OnnxSession,
  embedding: Extract<ImageEmbedding, { type: 'sam-hq' }>,
  points: [number, number][],
  labels: number[],
  numPoints: number,
  maskInput: Float32Array | null,
  outputWidth: number,
  outputHeight: number,
  smoothPasses: number
): Promise<MaskResult> {
  const pointsFlat = new Float32Array(numPoints * 2)
  for (let i = 0; i < numPoints; i++) {
    pointsFlat[i * 2] = points[i]![0]
    pointsFlat[i * 2 + 1] = points[i]![1]
  }

  const labelsFlat = new Float32Array(numPoints)
  for (let i = 0; i < numPoints; i++) {
    labelsFlat[i] = labels[i]!
  }

  const hasMask = maskInput != null
  const maskData = maskInput ?? new Float32Array(LOW_RES_MASK_SIZE * LOW_RES_MASK_SIZE)
  const intermDims = embedding.intermDims

  const feeds: Record<string, Tensor> = {
    image_embeddings: new ort.Tensor('float32', embedding.imageEmbeddings, [1, 256, 64, 64]),
    interm_embeddings: new ort.Tensor('float32', embedding.intermEmbeddings, intermDims),
    point_coords: new ort.Tensor('float32', pointsFlat, [1, numPoints, 2]),
    point_labels: new ort.Tensor('float32', labelsFlat, [1, numPoints]),
    mask_input: new ort.Tensor('float32', maskData, [1, 1, LOW_RES_MASK_SIZE, LOW_RES_MASK_SIZE]),
    has_mask_input: new ort.Tensor('float32', new Float32Array([hasMask ? 1.0 : 0.0]), [1]),
    // ONNX HQ decoder expects [height, width]
    orig_im_size: new ort.Tensor('float32', new Float32Array([outputHeight, outputWidth]), [2])
  }

  let results: Awaited<ReturnType<typeof session.decoderSession.run>>
  try {
    results = await session.decoderSession.run(feeds)
  } catch (err) {
    throw new Error('SAM-HQ decoder inference failed', { cause: err })
  }

  // masks: [1, 1, H, W] already at original image resolution
  const maskTensor = results.masks
  const dims = maskTensor.dims
  const maskH = Number(dims[dims.length - 2])
  const maskW = Number(dims[dims.length - 1])
  const raw = copyFloat32(maskTensor.data)
  const score = copyFloat32(results.iou_predictions.data)[0] ?? 0
  const lowRes = copyFloat32(results.low_res_masks.data)

  const outputPixels = outputWidth * outputHeight
  const imageData = new ImageData(outputWidth, outputHeight)
  const data = imageData.data
  const rawLogits = new Float32Array(NUM_MASKS * outputPixels)

  // Decoder output should match orig size; if not, nearest-neighbor resample.
  for (let y = 0; y < outputHeight; y++) {
    for (let x = 0; x < outputWidth; x++) {
      const srcX =
        maskW === outputWidth ? x : Math.min(maskW - 1, Math.floor((x * maskW) / outputWidth))
      const srcY =
        maskH === outputHeight ? y : Math.min(maskH - 1, Math.floor((y * maskH) / outputHeight))
      const logit = raw[srcY * maskW + srcX]!
      const idx = y * outputWidth + x
      rawLogits[idx] = logit
      const v = logit > 0 ? 255 : 0
      const p = idx * 4
      data[p] = v
      data[p + 1] = v
      data[p + 2] = v
      data[p + 3] = v
    }
  }

  if (smoothPasses > 0) {
    const alphaChannel = new Uint8ClampedArray(outputPixels)
    for (let j = 0; j < outputPixels; j++) alphaChannel[j] = data[j * 4 + 3]!
    const smoothed = smoothMask(alphaChannel, outputWidth, outputHeight, smoothPasses)
    for (let j = 0; j < outputPixels; j++) {
      const v = smoothed[j]!
      data[j * 4] = v
      data[j * 4 + 1] = v
      data[j * 4 + 2] = v
      data[j * 4 + 3] = v
    }
  }

  // Keep low-res buffer layout compatible with existing rethreshold path (3 slots).
  const lowResMasks = new Float32Array(NUM_MASKS * LOW_RES_MASK_SIZE * LOW_RES_MASK_SIZE)
  const copyLen = Math.min(lowRes.length, LOW_RES_MASK_SIZE * LOW_RES_MASK_SIZE)
  lowResMasks.set(lowRes.subarray(0, copyLen), 0)

  return {
    masks: [imageData],
    rawLogits,
    lowResMasks,
    scores: [score],
    selectedIndex: 0
  }
}

function copyFloat32(data: Tensor['data']): Float32Array {
  if (data instanceof Float32Array) return new Float32Array(data)
  return Float32Array.from(data as ArrayLike<number>)
}

function maskContainsPoints(
  mask: ImageData,
  points: Array<{ x: number; y: number }>
): boolean {
  if (points.length === 0) return true
  for (const point of points) {
    const x = Math.max(0, Math.min(mask.width - 1, Math.round(point.x)))
    const y = Math.max(0, Math.min(mask.height - 1, Math.round(point.y)))
    if (mask.data[(y * mask.width + x) * 4 + 3]! <= 128) return false
  }
  return true
}

function postProcessMasks(
  rawMasks: Float32Array,
  rawScores: Float32Array,
  maskWidth: number,
  maskHeight: number,
  outputWidth: number,
  outputHeight: number,
  threshold = 0.0,
  smoothPasses = 0,
  positivePoints: Array<{ x: number; y: number }> = []
): MaskResult {
  const scores: number[] = []
  const masks: ImageData[] = []

  const totalPixelsPerMask = maskWidth * maskHeight
  const numMasks = Math.max(1, Math.floor(rawMasks.length / totalPixelsPerMask))
  const maskScaleX = maskWidth / Math.max(outputWidth, outputHeight)
  const maskScaleY = maskHeight / Math.max(outputWidth, outputHeight)

  // Highest IoU overall (WebSAM default). Prefer candidates that contain
  // positive clicks when those exist — avoids "point outside mask".
  let bestIdx = 0
  let bestScore = -Infinity
  for (let i = 0; i < numMasks; i++) {
    const score = rawScores[i] ?? 0
    scores.push(score)
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }

  const lowResMasks = new Float32Array(numMasks * LOW_RES_MASK_SIZE * LOW_RES_MASK_SIZE)
  const outputPixels = outputWidth * outputHeight
  const rawLogits = new Float32Array(numMasks * outputPixels)

  for (let i = 0; i < numMasks; i++) {
    const maskOffset = i * totalPixelsPerMask
    const imageData = new ImageData(outputWidth, outputHeight)
    const data = imageData.data
    const logitOffset = i * outputPixels

    for (let y = 0; y < outputHeight; y++) {
      for (let x = 0; x < outputWidth; x++) {
        const srcX = x * maskScaleX
        const srcY = y * maskScaleY
        const logit = bilinearSample(rawMasks, maskOffset, maskWidth, maskHeight, srcX, srcY)

        const pixelIdx = (y * outputWidth + x) * 4
        const inMask = logit > threshold
        data[pixelIdx] = inMask ? 255 : 0
        data[pixelIdx + 1] = inMask ? 255 : 0
        data[pixelIdx + 2] = inMask ? 255 : 0
        data[pixelIdx + 3] = inMask ? 255 : 0

        rawLogits[logitOffset + y * outputWidth + x] = logit
      }
    }

    if (smoothPasses > 0) {
      const alphaChannel = new Uint8ClampedArray(outputPixels)
      for (let j = 0; j < outputPixels; j++) {
        alphaChannel[j] = data[j * 4 + 3]!
      }
      const smoothed = smoothMask(alphaChannel, outputWidth, outputHeight, smoothPasses)
      for (let j = 0; j < outputPixels; j++) {
        const v = smoothed[j]!
        data[j * 4] = v
        data[j * 4 + 1] = v
        data[j * 4 + 2] = v
        data[j * 4 + 3] = v
      }
    }

    masks.push(imageData)

    const lrScaleX = LOW_RES_MASK_SIZE / maskWidth
    const lrScaleY = LOW_RES_MASK_SIZE / maskHeight
    const lrOffset = i * LOW_RES_MASK_SIZE * LOW_RES_MASK_SIZE
    for (let y = 0; y < LOW_RES_MASK_SIZE; y++) {
      for (let x = 0; x < LOW_RES_MASK_SIZE; x++) {
        const srcX2 = x / lrScaleX
        const srcY2 = y / lrScaleY
        lowResMasks[lrOffset + y * LOW_RES_MASK_SIZE + x] = bilinearSample(
          rawMasks,
          maskOffset,
          maskWidth,
          maskHeight,
          srcX2,
          srcY2
        )
      }
    }
  }

  if (positivePoints.length > 0) {
    let containingBestIdx = -1
    let containingBestScore = -Infinity
    for (let i = 0; i < masks.length; i++) {
      const score = scores[i] ?? -Infinity
      if (score <= containingBestScore) continue
      if (!maskContainsPoints(masks[i]!, positivePoints)) continue
      containingBestScore = score
      containingBestIdx = i
    }
    if (containingBestIdx >= 0) bestIdx = containingBestIdx
  }

  return { masks, rawLogits, lowResMasks, scores, selectedIndex: bestIdx }
}

function bilinearSample(
  data: Float32Array,
  offset: number,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const x0 = Math.max(0, Math.min(Math.floor(x), width - 1))
  const y0 = Math.max(0, Math.min(Math.floor(y), height - 1))
  const x1 = Math.min(x0 + 1, width - 1)
  const y1 = Math.min(y0 + 1, height - 1)
  const fx = x - x0
  const fy = y - y0

  const v00 = data[offset + y0 * width + x0]!
  const v10 = data[offset + y0 * width + x1]!
  const v01 = data[offset + y1 * width + x0]!
  const v11 = data[offset + y1 * width + x1]!

  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy
}

export function reprocessMasks(
  rawLogits: Float32Array,
  scores: number[],
  selectedIndex: number,
  lowResMasks: Float32Array,
  outputWidth: number,
  outputHeight: number,
  threshold: number,
  smoothPasses: number
): MaskResult {
  const masks: ImageData[] = []
  const outputPixels = outputWidth * outputHeight
  const numMasks = Math.max(1, Math.floor(rawLogits.length / outputPixels))

  for (let i = 0; i < numMasks; i++) {
    const logitOffset = i * outputPixels
    const imageData = new ImageData(outputWidth, outputHeight)
    const data = imageData.data

    for (let j = 0; j < outputPixels; j++) {
      const inMask = rawLogits[logitOffset + j]! > threshold
      const v = inMask ? 255 : 0
      data[j * 4] = v
      data[j * 4 + 1] = v
      data[j * 4 + 2] = v
      data[j * 4 + 3] = v
    }

    if (smoothPasses > 0) {
      const alphaChannel = new Uint8ClampedArray(outputPixels)
      for (let j = 0; j < outputPixels; j++) {
        alphaChannel[j] = data[j * 4 + 3]!
      }
      const smoothed = smoothMask(alphaChannel, outputWidth, outputHeight, smoothPasses)
      for (let j = 0; j < outputPixels; j++) {
        const v = smoothed[j]!
        data[j * 4] = v
        data[j * 4 + 1] = v
        data[j * 4 + 2] = v
        data[j * 4 + 3] = v
      }
    }

    masks.push(imageData)
  }

  return { masks, rawLogits, lowResMasks, scores, selectedIndex }
}
