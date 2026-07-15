import * as Comlink from 'comlink'
import {
  clearWebGpuRuntimeError,
  createSession,
  destroySession,
  getOrt,
  getSession,
  throwIfWebGpuRuntimeError,
  type ModelBuffers
} from './session'
import { encodeImage } from './encoder'
import { decodeMask, reprocessMasks, type DecoderOptions } from './decoder'
import type {
  ModelInfo,
  RawImageData,
  ImageEmbedding,
  MaskResult,
  PromptInput,
  EmbeddingInfo
} from './types'

let cachedEmbedding: ImageEmbedding | null = null

interface CachedDecodeResult {
  rawLogits: Float32Array
  scores: number[]
  selectedIndex: number
  lowResMasks: Float32Array
}
let cachedDecodeResult: CachedDecodeResult | null = null

let workerBusy: Promise<void> = Promise.resolve()
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const task = workerBusy.then(fn)
  workerBusy = task.then(
    () => undefined,
    () => undefined
  )
  return task
}

async function withWebGpuGuard<T>(context: string, fn: () => Promise<T>): Promise<T> {
  clearWebGpuRuntimeError()
  try {
    const result = await fn()
    const ort = await getOrt()
    const webgpuEnv = ort.env.webgpu as unknown as {
      device?: GPUDevice | Promise<GPUDevice>
    }
    const raw = webgpuEnv.device
    const device = raw instanceof Promise ? await raw : raw
    if (device?.queue && 'onSubmittedWorkDone' in device.queue) {
      try {
        await device.queue.onSubmittedWorkDone()
      } catch {
        // ignore — uncapturederror handler records the real failure
      }
    } else {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    throwIfWebGpuRuntimeError(context)
    return result
  } catch (err) {
    throwIfWebGpuRuntimeError(context)
    throw err
  }
}

const api = {
  async initFromBuffers(model: ModelInfo, buffers: ModelBuffers): Promise<void> {
    return serialize(async () => {
      await destroySession()
      cachedEmbedding = null
      cachedDecodeResult = null
      await createSession(model, buffers)
    })
  },

  async initFromUrls(model: ModelInfo, encoderUrl: string, decoderUrl: string): Promise<void> {
    return serialize(async () => {
      await destroySession()
      cachedEmbedding = null
      cachedDecodeResult = null

      const [encoderRes, decoderRes] = await Promise.all([fetch(encoderUrl), fetch(decoderUrl)])
      if (!encoderRes.ok) {
        throw new Error(`Failed to fetch encoder: ${encoderRes.status}`)
      }
      if (!decoderRes.ok) {
        throw new Error(`Failed to fetch decoder: ${decoderRes.status}`)
      }

      const [encoderBuffer, decoderBuffer] = await Promise.all([
        encoderRes.arrayBuffer(),
        decoderRes.arrayBuffer()
      ])
      try {
        await createSession(model, { encoderBuffer, decoderBuffer })
      } catch (err) {
        throw new Error(`Failed to load model "${model.name}"`, { cause: err })
      }
    })
  },

  async encode(
    imageData: RawImageData,
    onSubstage?: (stage: 'preprocessing' | 'inference') => void
  ): Promise<EmbeddingInfo> {
    return serialize(async () => {
      const session = getSession()
      if (!session) throw new Error('No active session')
      cachedEmbedding = await withWebGpuGuard('Image encoding failed', () =>
        encodeImage(session, imageData, onSubstage)
      )
      return { type: cachedEmbedding.type, ready: true }
    })
  },

  async decode(prompt: PromptInput, options: DecoderOptions): Promise<MaskResult> {
    return serialize(async () => {
      const session = getSession()
      if (!session || !cachedEmbedding) {
        throw new Error('No session or embedding')
      }
      const result = await withWebGpuGuard('Segmenting failed', () =>
        decodeMask(session, cachedEmbedding!, prompt, options)
      )
      cachedDecodeResult = {
        rawLogits: result.rawLogits,
        scores: [...result.scores],
        selectedIndex: result.selectedIndex,
        lowResMasks: result.lowResMasks
      }
      return result
    })
  },

  rethreshold(
    threshold: number,
    smoothPasses: number,
    outputWidth: number,
    outputHeight: number
  ): MaskResult | null {
    if (!cachedDecodeResult) return null
    return reprocessMasks(
      cachedDecodeResult.rawLogits,
      cachedDecodeResult.scores,
      cachedDecodeResult.selectedIndex,
      cachedDecodeResult.lowResMasks,
      outputWidth,
      outputHeight,
      threshold,
      smoothPasses
    )
  },

  async destroy(): Promise<void> {
    return serialize(async () => {
      await destroySession()
      cachedEmbedding = null
      cachedDecodeResult = null
    })
  },

  getEmbedding(): ImageEmbedding | null {
    return cachedEmbedding
  },

  clearEmbedding(): void {
    cachedEmbedding = null
    cachedDecodeResult = null
  },

  getBackend(): 'webgpu' | 'wasm' | null {
    return getSession()?.backend ?? null
  }
}

export type InferenceWorkerApi = typeof api
Comlink.expose(api)
