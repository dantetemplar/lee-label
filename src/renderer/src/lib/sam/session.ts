import type { InferenceSession } from 'onnxruntime-web'
import * as ortModuleImport from 'onnxruntime-web/all'
import type { ModelInfo } from './types'

async function loadOrtModule(): Promise<typeof import('onnxruntime-web/all')> {
  // /all includes WebGPU + full WASM kernels. /webgpu's WASM fallback omits
  // ops EdgeSAM needs (e.g. Cast bool→int64), which breaks the decoder.
  return ortModuleImport
}

export type OrtModule = Awaited<ReturnType<typeof loadOrtModule>>

let ortModule: OrtModule | null = null

export async function getOrt(): Promise<OrtModule> {
  if (ortModule) return ortModule
  ortModule = await loadOrtModule()
  return ortModule
}

export interface OnnxSession {
  encoderSession: InferenceSession
  decoderSession: InferenceSession
  model: ModelInfo
  backend: 'webgpu' | 'wasm'
}

export interface ModelBuffers {
  encoderBuffer: ArrayBuffer
  decoderBuffer: ArrayBuffer
}

let currentSession: OnnxSession | null = null
let webgpuAdapterReady = false
let lastWebGpuError: Error | null = null
let webgpuDeviceHooked: GPUDevice | null = null
let wasmAssetBaseUrl: string | null = null

export function setWasmAssetBaseUrl(url: string): void {
  wasmAssetBaseUrl = url
}

async function configureOrt(useWebGPU: boolean): Promise<OrtModule> {
  const ort = await getOrt()
  ort.env.logLevel = 'warning'
  // Resolved by the renderer page and passed into the inline worker. Blob worker
  // URLs cannot be used as a base for packaged ORT module/WASM assets.
  if (!wasmAssetBaseUrl) throw new Error('ORT WASM asset URL was not configured')
  ort.env.wasm.wasmPaths = wasmAssetBaseUrl

  if (useWebGPU) {
    ort.env.wasm.numThreads = 1
    if (!webgpuAdapterReady && typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter({
          powerPreference: 'high-performance'
        })
        const webgpuEnv = ort.env.webgpu as {
          adapter?: GPUAdapter
          powerPreference?: GPUPowerPreference
        }
        if (adapter) {
          // Prefer discrete GPU before ORT creates its WebGPU device.
          webgpuEnv.adapter = adapter
        }
        webgpuEnv.powerPreference = 'high-performance'
      } catch {
        // Adapter probe is best-effort; session create will report real failures.
      }
      webgpuAdapterReady = true
    }
  } else {
    // Multi-thread WASM needs SharedArrayBuffer (crossOriginIsolated via COOP/COEP).
    const cores = navigator.hardwareConcurrency || 4
    ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(cores, 8) : 1
  }

  return ort
}

function isPreOptimizedEncoder(model: ModelInfo): boolean {
  // .ort is pre-optimized; fp16 .onnx must skip ORT graph opts (shape-merge breaks).
  return model.encoderKey.endsWith('.ort') || model.quantization === 'fp16'
}

/** Chromium often reports Softmax/Add bind failures as uncaptured errors without rejecting OrtRun. */
async function hookWebGpuDeviceErrors(ort: OrtModule): Promise<void> {
  const webgpuEnv = ort.env.webgpu as unknown as {
    device?: GPUDevice | Promise<GPUDevice>
  }
  const raw = webgpuEnv.device
  if (!raw) return
  const device = raw instanceof Promise ? await raw : raw
  if (!device || device === webgpuDeviceHooked) return
  webgpuDeviceHooked = device
  lastWebGpuError = null

  device.addEventListener('uncapturederror', (event) => {
    const gpuError = (event as GPUUncapturedErrorEvent).error
    lastWebGpuError = new Error(gpuError.message || 'WebGPU validation error', { cause: gpuError })
  })

  void device.lost.then((info) => {
    lastWebGpuError = new Error(`WebGPU device lost: ${info.message}`)
  })
}

export function clearWebGpuRuntimeError(): void {
  lastWebGpuError = null
}

/** Throw if an uncaptured WebGPU error was recorded during the last op. */
export function throwIfWebGpuRuntimeError(context: string): void {
  if (!lastWebGpuError) return
  const err = lastWebGpuError
  lastWebGpuError = null
  throw new Error(`${context}: ${err.message}`, { cause: err })
}

async function createSessionPair(
  ort: OrtModule,
  model: ModelInfo,
  buffers: ModelBuffers,
  executionProviders: InferenceSession.ExecutionProviderConfig[],
  backend: 'webgpu' | 'wasm'
): Promise<OnnxSession> {
  const encoderOptions: InferenceSession.SessionOptions = {
    executionProviders,
    ...(isPreOptimizedEncoder(model) && { graphOptimizationLevel: 'disabled' })
  }
  const decoderOptions: InferenceSession.SessionOptions = {
    executionProviders
  }

  const encoderSession = await ort.InferenceSession.create(buffers.encoderBuffer, encoderOptions)
  const decoderSession = await ort.InferenceSession.create(buffers.decoderBuffer, decoderOptions)

  if (backend === 'webgpu') {
    await hookWebGpuDeviceErrors(ort)
  }

  currentSession = {
    encoderSession,
    decoderSession,
    model,
    backend
  }
  return currentSession
}

export async function createSession(model: ModelInfo, buffers: ModelBuffers): Promise<OnnxSession> {
  const ort = await getOrt()
  const wasmProviders: InferenceSession.ExecutionProviderConfig[] = ['wasm']
  // Explicit NCHW: default JS WebGPU layout path corrupts the first SAM2 box
  // decode (labels 2/3) on NVIDIA/Electron; preferredLayout:'NCHW' fixes it.
  const webgpuProviders: InferenceSession.ExecutionProviderConfig[] = [
    { name: 'webgpu', preferredLayout: 'NCHW' }
  ]

  // Lightweight models (EdgeSAM, SlimSAM): WASM only. No WebGPU→WASM fallback for GPU models.
  if (model.family === 'edgesam' || !model.requiresWebGPU) {
    await configureOrt(false)
    return createSessionPair(ort, model, buffers, wasmProviders, 'wasm')
  }

  await configureOrt(true)
  return createSessionPair(ort, model, buffers, webgpuProviders, 'webgpu')
}

export function getSession(): OnnxSession | null {
  return currentSession
}

export async function destroySession(): Promise<void> {
  if (currentSession) {
    await Promise.all([
      currentSession.encoderSession.release(),
      currentSession.decoderSession.release()
    ])
    currentSession = null
  }
  lastWebGpuError = null
  webgpuDeviceHooked = null
}
