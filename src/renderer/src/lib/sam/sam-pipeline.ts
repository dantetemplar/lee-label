import { createSignal } from 'solid-js'
import * as Comlink from 'comlink'
import type { WebsamDownloadProgress } from '../../../../shared/websam-models'
import { getModelById, MODEL_REGISTRY } from './models'
import type { Box, DecodeUiResult, Point, PromptInput, RawImageData } from './types'
import {
  getWorkerApi,
  isWorkerAlive,
  onWorkerError,
  restartWorker,
  terminateWorker,
  withTimeout
} from './worker-api'
import { imageToRawData } from './image'

export type SamPipelineStatus =
  'idle' | 'loading-model' | 'ready' | 'encoding' | 'decoding' | 'error'

const [selectedModelId, setSelectedModelId] = createSignal<string>('sam-hq-tiny')
const [modelCached, setModelCached] = createSignal<Record<string, boolean>>({})
const [downloadProgress, setDownloadProgress] = createSignal<WebsamDownloadProgress | null>(null)
const [pipelineStatus, setPipelineStatus] = createSignal<SamPipelineStatus>('idle')
const [pipelineError, setPipelineError] = createSignal<string | null>(null)
const [pipelineErrorPhase, setPipelineErrorPhase] = createSignal<
  'load' | 'encode' | 'decode' | null
>(null)
const [webgpuAvailable, setWebgpuAvailable] = createSignal<boolean | null>(null)
const [embeddingReady, setEmbeddingReady] = createSignal(false)
const [lastEncodeMs, setLastEncodeMs] = createSignal<number | null>(null)
const [lastDecodeMs, setLastDecodeMs] = createSignal<number | null>(null)
const [maskPreview, setMaskPreview] = createSignal<ImageData | null>(null)
const [promptPoints, setPromptPoints] = createSignal<Point[]>([])
const [promptBox, setPromptBox] = createSignal<Box | null>(null)

/** Bump when encode pixel path changes so stale embeddings are discarded. */
const ENCODE_CACHE_VERSION = 3

let encodedImageKey: string | null = null
let decodeGeneration = 0
let unloadGeneration = 0
let encodeGeneration = 0
let loadInFlight: Promise<boolean> | null = null
let loadInFlightId: string | null = null
let encodeInFlight: Promise<boolean> | null = null
let encodeInFlightKey: string | null = null

const [loadedModelId, setLoadedModelId] = createSignal<string | null>(null)

function collectErrorText(err: unknown): string {
  const parts: string[] = []
  let current: unknown = err
  for (let depth = 0; depth < 6 && current != null; depth++) {
    if (current instanceof Error) {
      if (current.message) parts.push(current.message)
      current = current.cause
    } else {
      parts.push(String(current))
      break
    }
  }
  return parts.join(' — ')
}

/** Short, user-facing message for Magick Stick status. */
export function formatSamError(err: unknown): string {
  const raw = collectErrorText(err)
  if (/webgpu is required/i.test(raw)) return 'WebGPU is required for this model'
  if (
    /out of memory|oom|Invalid BindGroup|Invalid Buffer|Invalid CommandBuffer|validation (error|failed)|device lost/i.test(
      raw
    )
  ) {
    if (/sam3/i.test(raw)) {
      return 'SAM 3 needs ~3.6 GB VRAM — close other GPU apps or use a smaller model'
    }
    return 'WebGPU out of memory — try Light HQ-SAM or a smaller model'
  }
  if (/Image encoding failed/i.test(raw)) {
    return formatSamError(raw.replace(/^Image encoding failed:\s*/i, ''))
  }
  if (/Segmenting failed/i.test(raw)) {
    return formatSamError(raw.replace(/^Segmenting failed:\s*/i, ''))
  }
  if (/timed out/i.test(raw)) return raw
  if (/Failed to fetch|Model files not found|not downloaded/i.test(raw)) return raw
  if (/No active session|SAM worker/i.test(raw))
    return 'Model worker crashed — select the model again'
  // Prefer the deepest / most specific segment when ORT wraps errors.
  const segments = raw
    .split(/\s*[—\n]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  const pick =
    segments.find((s) => /ERROR_MESSAGE|WebGPU|failed/i.test(s)) ?? segments.at(-1) ?? raw
  return pick.length > 180 ? `${pick.slice(0, 177)}…` : pick
}

function fail(err: unknown, phase: 'load' | 'encode' | 'decode' = 'load'): false {
  setPipelineErrorPhase(phase)
  setPipelineError(formatSamError(err))
  setPipelineStatus('error')
  return false
}

onWorkerError((error) => {
  setLoadedModelId(null)
  loadInFlight = null
  loadInFlightId = null
  setEmbeddingReady(false)
  fail(error, 'load')
})

export const samPipeline = {
  selectedModelId,
  setSelectedModelId,
  modelCached,
  downloadProgress,
  pipelineStatus,
  pipelineError,
  pipelineErrorPhase,
  webgpuAvailable,
  embeddingReady,
  lastEncodeMs,
  lastDecodeMs,
  maskPreview,
  promptPoints,
  promptBox,
  loadedModelId,

  /** True while the model is loading or the current image is being encoded/decoded. */
  isBusy(): boolean {
    const status = pipelineStatus()
    return status === 'loading-model' || status === 'encoding' || status === 'decoding'
  },

  /** Magic Stick is usable for prompts (model loaded + image embedding ready). */
  isInteractionReady(): boolean {
    return (
      pipelineStatus() === 'ready' &&
      embeddingReady() &&
      loadedModelId() !== null
    )
  },

  async refreshCacheStatus(): Promise<void> {
    const statuses = await window.api.models.listStatus()
    const map: Record<string, boolean> = {}
    for (const s of statuses) map[s.id] = s.cached
    setModelCached(map)
  },

  async probeWebGpu(): Promise<boolean> {
    const available = typeof navigator !== 'undefined' && 'gpu' in navigator && !!navigator.gpu
    setWebgpuAvailable(available)
    return available
  },

  async downloadModel(modelId: string): Promise<boolean> {
    setDownloadProgress({
      id: modelId,
      stage: 'downloading',
      received: 0,
      total: getModelById(modelId)?.totalSize ?? 0
    })
    setPipelineError(null)
    const unsub = window.api.models.onDownloadProgress((progress) => {
      if (progress.id === modelId) setDownloadProgress(progress)
    })
    try {
      const result = await window.api.models.download(modelId)
      await this.refreshCacheStatus()
      if (!result.ok) {
        fail(result.cancelled ? 'Download cancelled' : 'Download failed')
        return false
      }
      return true
    } catch (err) {
      fail(err)
      return false
    } finally {
      unsub()
    }
  },

  cancelDownload(): void {
    void window.api.models.cancelDownload()
  },

  clearPrompts(): void {
    setPromptPoints([])
    setPromptBox(null)
    setMaskPreview(null)
    setLastDecodeMs(null)
    decodeGeneration++
  },

  /** Drop image embedding without unloading the model (e.g. when switching images). */
  invalidateEmbedding(): void {
    encodeGeneration++
    encodeInFlight = null
    encodeInFlightKey = null
    encodedImageKey = null
    setEmbeddingReady(false)
    setLastEncodeMs(null)
    setLastDecodeMs(null)
    setMaskPreview(null)
  },

  /** Release GPU/WASM sessions and free worker memory. Disk cache is kept. */
  async unloadModel(): Promise<void> {
    unloadGeneration++
    decodeGeneration++
    this.clearPrompts()
    this.invalidateEmbedding()
    loadInFlight = null
    loadInFlightId = null
    setLoadedModelId(null)
    setPipelineError(null)
    setPipelineErrorPhase(null)
    setPipelineStatus('idle')
    await terminateWorker()
    // Keep idle even if a late teardown event races in.
    setPipelineError(null)
    setPipelineErrorPhase(null)
    setPipelineStatus('idle')
    setLoadedModelId(null)
  },

  addPoint(point: Point): void {
    setPromptPoints((prev) => [...prev, point])
  },

  setBox(box: Box | null): void {
    setPromptBox(box)
  },

  async ensureModelLoaded(modelId: string): Promise<boolean> {
    const model = getModelById(modelId)
    if (!model) {
      return fail(`Unknown model: ${modelId}`)
    }

    if (model.requiresWebGPU) {
      const ok = webgpuAvailable() ?? (await this.probeWebGpu())
      if (!ok) {
        return fail('WebGPU is required for this model')
      }
    }

    // Same model already in the worker — keep a prior encode/decode error visible.
    if (loadedModelId() === modelId && isWorkerAlive()) {
      return true
    }

    if (loadInFlight && loadInFlightId === modelId) {
      return loadInFlight
    }

    const cached = modelCached()[modelId]
    if (!cached) {
      setPipelineError(null)
      setPipelineStatus('idle')
      return false
    }

    loadInFlightId = modelId
    const generation = unloadGeneration
    loadInFlight = (async (): Promise<boolean> => {
      try {
        const urls = await window.api.models.getFileUrls(modelId)
        if (generation !== unloadGeneration) return false
        if (!urls) {
          return fail('Model files not found')
        }

        // Another concurrent caller may have finished loading while we awaited URLs.
        if (loadedModelId() === modelId && isWorkerAlive()) {
          if (pipelineStatus() === 'loading-model') {
            setPipelineStatus('ready')
          }
          return true
        }

        setPipelineStatus('loading-model')
        setPipelineError(null)
        setPipelineErrorPhase(null)
        try {
          // Fresh worker clears a poisoned WebGPU device after OOM / Softmax bind failures.
          if (loadedModelId() !== null && loadedModelId() !== modelId) {
            await terminateWorker()
            if (generation !== unloadGeneration) return false
            setLoadedModelId(null)
          }
          const api = isWorkerAlive() ? getWorkerApi() : restartWorker()
          const wasmBaseUrl = new URL('./wasm/', window.location.href).href
          await withTimeout(
            api.initFromUrls(model, urls.encoderUrl, urls.decoderUrl, wasmBaseUrl),
            180_000,
            'init'
          )
          if (generation !== unloadGeneration) return false
          setLoadedModelId(modelId)
          encodedImageKey = null
          setEmbeddingReady(false)
          setLastEncodeMs(null)
          setLastDecodeMs(null)
          setPipelineError(null)
          setPipelineStatus('ready')
          return true
        } catch (err) {
          if (generation !== unloadGeneration) return false
          setLoadedModelId(null)
          return fail(err)
        }
      } finally {
        if (loadInFlightId === modelId) {
          loadInFlight = null
          loadInFlightId = null
        }
      }
    })()

    return loadInFlight
  },

  async encodeImage(image: HTMLImageElement, imageKey: string): Promise<boolean> {
    if (!(await this.ensureModelLoaded(selectedModelId()))) return false
    const cacheKey = `${ENCODE_CACHE_VERSION}:${imageKey}`
    if (encodedImageKey === cacheKey && embeddingReady()) return true
    if (encodeInFlight && encodeInFlightKey === cacheKey) return encodeInFlight

    const unloadGen = unloadGeneration
    const encodeGen = encodeGeneration
    encodeInFlightKey = cacheKey
    encodeInFlight = (async (): Promise<boolean> => {
      setPipelineStatus('encoding')
      setPipelineError(null)
      setPipelineErrorPhase(null)
      setLastEncodeMs(null)
      setLastDecodeMs(null)
      const startedAt = performance.now()
      try {
        const extracted = await imageToRawData(image)
        if (unloadGen !== unloadGeneration || encodeGen !== encodeGeneration) return false
        const data = new Uint8ClampedArray(extracted.data)
        const raw: RawImageData = {
          data,
          width: extracted.width,
          height: extracted.height
        }
        const api = getWorkerApi()
        await withTimeout(api.encode(Comlink.transfer(raw, [raw.data.buffer])), 300_000, 'encode')
        if (unloadGen !== unloadGeneration || encodeGen !== encodeGeneration) return false
        encodedImageKey = cacheKey
        setLastEncodeMs(Math.round(performance.now() - startedAt))
        setEmbeddingReady(true)
        setPipelineStatus('ready')
        return true
      } catch (err) {
        if (unloadGen !== unloadGeneration || encodeGen !== encodeGeneration) return false
        setEmbeddingReady(false)
        encodedImageKey = null
        return fail(err, 'encode')
      } finally {
        if (encodeInFlightKey === cacheKey) {
          encodeInFlight = null
          encodeInFlightKey = null
        }
      }
    })()

    return encodeInFlight
  },

  async decodeCurrentPrompts(
    outputWidth: number,
    outputHeight: number
  ): Promise<DecodeUiResult | null> {
    const points = promptPoints()
    const box = promptBox()
    if (points.length === 0 && !box) {
      setMaskPreview(null)
      return null
    }
    if (!embeddingReady()) return null

    const generation = ++decodeGeneration
    const unloadGen = unloadGeneration
    setLastDecodeMs(null)
    setPipelineStatus('decoding')
    setPipelineError(null)
    setPipelineErrorPhase(null)
    const startedAt = performance.now()
    try {
      const prompt: PromptInput = {
        points: points.length > 0 ? points : undefined,
        box: box ?? undefined
      }
      const api = getWorkerApi()
      const result = await withTimeout(
        api.decode(prompt, {
          // Fresh decode from prompts only — feeding prior masks biases toward
          // oversized first-click regions on ambiguous PCB parts.
          maskInput: null,
          outputWidth,
          outputHeight,
          smoothPasses: 0
        }),
        120_000,
        'decode'
      )
      if (generation !== decodeGeneration || unloadGen !== unloadGeneration) return null

      setLastDecodeMs(Math.round(performance.now() - startedAt))
      const preview = new ImageData(result.width, result.height)
      for (let i = 0; i < result.bitmap.length; i++) {
        const v = result.bitmap[i]!
        preview.data[i * 4] = v
        preview.data[i * 4 + 1] = v
        preview.data[i * 4 + 2] = v
        preview.data[i * 4 + 3] = v
      }
      setMaskPreview(preview)
      setPipelineStatus('ready')
      return result
    } catch (err) {
      if (generation !== decodeGeneration || unloadGen !== unloadGeneration) return null
      fail(err, 'decode')
      return null
    }
  },

  getBestMaskBitmap(): Uint8Array | null {
    const mask = maskPreview()
    if (!mask) return null
    const out = new Uint8Array(mask.width * mask.height)
    for (let i = 0; i < out.length; i++) {
      out[i] = mask.data[i * 4 + 3]! > 128 ? 255 : 0
    }
    return out
  },

  async dispose(): Promise<void> {
    await this.unloadModel()
  },

  defaultModelId(): string {
    const cached = modelCached()
    const firstHq = MODEL_REGISTRY.find((m) => m.family === 'sam-hq' && cached[m.id])
    if (firstHq) return firstHq.id
    const firstCachedGpu = MODEL_REGISTRY.find((m) => m.requiresWebGPU && cached[m.id])
    if (firstCachedGpu) return firstCachedGpu.id
    const firstCached = MODEL_REGISTRY.find((m) => cached[m.id])
    if (firstCached) return firstCached.id
    return 'sam-hq-tiny'
  }
}
