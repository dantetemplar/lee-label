import { getOrt, type OnnxSession } from './session'
import type { ImageEmbedding, RawImageData } from './types'

const IMAGE_MEAN = [0.485, 0.456, 0.406] as const
const IMAGE_STD = [0.229, 0.224, 0.225] as const
const MODEL_INPUT_SIZE = 1024

function preprocessImageLetterbox(
  imageData: RawImageData,
  size: number,
  mean: readonly [number, number, number],
  std: readonly [number, number, number]
): Float32Array {
  const { width: w, height: h } = imageData

  const scale = size / Math.max(w, h)
  const newW = Math.round(w * scale)
  const newH = Math.round(h * scale)

  const srcCanvas = new OffscreenCanvas(w, h)
  const srcCtx = srcCanvas.getContext('2d')
  if (!srcCtx) throw new Error('Failed to create offscreen canvas context')
  const pixelData = new Uint8ClampedArray(imageData.data)
  const srcImageData = new ImageData(pixelData, w, h)
  srcCtx.putImageData(srcImageData, 0, 0)

  const canvas = new OffscreenCanvas(size, size)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create offscreen canvas context')
  ctx.drawImage(srcCanvas, 0, 0, newW, newH)

  const resized = ctx.getImageData(0, 0, size, size)
  const pixels = resized.data

  const totalPixels = size * size
  const tensor = new Float32Array(3 * totalPixels)

  for (let i = 0; i < totalPixels; i++) {
    const rgbaIdx = i * 4
    for (let c = 0; c < 3; c++) {
      const val = pixels[rgbaIdx + c]! / 255.0
      tensor[c * totalPixels + i] = (val - mean[c]!) / std[c]!
    }
  }

  return tensor
}

export async function encodeImage(
  session: OnnxSession,
  imageData: RawImageData,
  onSubstage?: (stage: 'preprocessing' | 'inference') => void
): Promise<ImageEmbedding> {
  const ort = await getOrt()
  const family = session.model.family
  onSubstage?.('preprocessing')

  const inputTensor = preprocessImageLetterbox(imageData, MODEL_INPUT_SIZE, IMAGE_MEAN, IMAGE_STD)

  if (family === 'sam1') {
    const feeds = {
      pixel_values: new ort.Tensor('float32', inputTensor, [
        1,
        3,
        MODEL_INPUT_SIZE,
        MODEL_INPUT_SIZE
      ])
    }

    onSubstage?.('inference')
    let results: Awaited<ReturnType<typeof session.encoderSession.run>>
    try {
      results = await session.encoderSession.run(feeds)
    } catch (err) {
      throw new Error('SAM1 encoder inference failed', { cause: err })
    }

    return {
      type: 'sam1',
      imageEmbeddings: copyFloat32(results.image_embeddings.data),
      imagePositionalEmbeddings: copyFloat32(results.image_positional_embeddings.data)
    }
  }

  if (family === 'edgesam') {
    const feeds = {
      image: new ort.Tensor('float32', inputTensor, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE])
    }

    onSubstage?.('inference')
    let results: Awaited<ReturnType<typeof session.encoderSession.run>>
    try {
      results = await session.encoderSession.run(feeds)
    } catch (err) {
      throw new Error('EdgeSAM encoder inference failed', { cause: err })
    }

    return {
      type: 'edgesam',
      imageEmbeddings: copyFloat32(results.image_embeddings.data)
    }
  }

  if (family === 'sam-hq') {
    const feeds = {
      input_image: new ort.Tensor('float32', inputTensor, [
        1,
        3,
        MODEL_INPUT_SIZE,
        MODEL_INPUT_SIZE
      ])
    }

    onSubstage?.('inference')
    let results: Awaited<ReturnType<typeof session.encoderSession.run>>
    try {
      results = await session.encoderSession.run(feeds)
    } catch (err) {
      throw new Error('SAM-HQ encoder inference failed', { cause: err })
    }

    const imageEmbeddings = copyFloat32(results.image_embeddings.data)
    const intermEmbeddings = copyFloat32(results.interm_embeddings.data)
    return {
      type: 'sam-hq',
      imageEmbeddings,
      intermEmbeddings,
      intermDims: resolveSamHqIntermDims(session.model.intermDims, intermEmbeddings.length)
    }
  }

  const feeds = {
    image: new ort.Tensor('float32', inputTensor, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE])
  }

  onSubstage?.('inference')
  let results: Awaited<ReturnType<typeof session.encoderSession.run>>
  try {
    results = await session.encoderSession.run(feeds)
  } catch (err) {
    throw new Error('SAM2 encoder inference failed', { cause: err })
  }

  return {
    type: 'sam2',
    imageEmbed: copyFloat32(results.image_embed.data),
    highResFeats0: copyFloat32(results.high_res_feats_0.data),
    highResFeats1: copyFloat32(results.high_res_feats_1.data)
  }
}

function copyFloat32(data: ArrayBufferView | unknown): Float32Array {
  if (data instanceof Float32Array) return new Float32Array(data)
  return Float32Array.from(data as ArrayLike<number>)
}

const SAM_HQ_INTERM_DIMS: number[][] = [
  [1, 1, 64, 64, 160],
  [4, 1, 64, 64, 768],
  [4, 1, 64, 64, 1024],
  [4, 1, 64, 64, 1280]
]

export function resolveSamHqIntermDims(
  preferred: number[] | undefined,
  length: number
): number[] {
  if (preferred && preferred.reduce((a, b) => a * b, 1) === length) {
    return preferred
  }
  for (const dims of SAM_HQ_INTERM_DIMS) {
    if (dims.reduce((a, b) => a * b, 1) === length) return [...dims]
  }
  throw new Error(`Unknown SAM-HQ interm embedding length: ${length}`)
}
