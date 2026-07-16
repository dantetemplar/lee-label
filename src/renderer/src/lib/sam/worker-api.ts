import * as Comlink from 'comlink'
import type { InferenceWorkerApi } from './worker'
import SamWorker from './worker?worker&inline'

let worker: Worker | null = null
let proxy: Comlink.Remote<InferenceWorkerApi> | null = null
/** Suppress crash toasts while we intentionally destroy/terminate the worker. */
let suppressWorkerErrors = 0

type WorkerErrorListener = (error: Error) => void
const errorListeners = new Set<WorkerErrorListener>()

export function onWorkerError(listener: WorkerErrorListener): () => void {
  errorListeners.add(listener)
  return () => errorListeners.delete(listener)
}

function notifyError(error: Error): void {
  if (suppressWorkerErrors > 0) return
  for (const listener of errorListeners) {
    try {
      listener(error)
    } catch {
      // ignore
    }
  }
}

function createWorker(): { worker: Worker; proxy: Comlink.Remote<InferenceWorkerApi> } {
  const w = new SamWorker()

  w.onerror = (event) => {
    console.error('SAM worker error:', {
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      error: event.error
    })
    const location = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : ''
    notifyError(new Error(`${event.message || 'SAM worker error'}${location}`))
    teardown()
  }

  w.onmessageerror = () => {
    notifyError(new Error('SAM worker message deserialization failed'))
    teardown()
  }

  return { worker: w, proxy: Comlink.wrap<InferenceWorkerApi>(w) }
}

function teardown(): void {
  if (worker) {
    worker.onerror = null
    worker.onmessageerror = null
    worker.terminate()
  }
  worker = null
  proxy = null
}

export function getWorkerApi(): Comlink.Remote<InferenceWorkerApi> {
  if (typeof Worker === 'undefined') {
    throw new Error('Workers are not available in this environment')
  }
  if (proxy) return proxy
  const created = createWorker()
  worker = created.worker
  proxy = created.proxy
  return proxy
}

export function isWorkerAlive(): boolean {
  return worker !== null && proxy !== null
}

export function restartWorker(): Comlink.Remote<InferenceWorkerApi> {
  suppressWorkerErrors++
  try {
    teardown()
  } finally {
    suppressWorkerErrors--
  }
  return getWorkerApi()
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Worker call '${label}' timed out after ${(ms / 1000).toFixed(0)}s`))
    }, ms)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    )
  })
}

export async function terminateWorker(): Promise<void> {
  suppressWorkerErrors++
  try {
    if (proxy) {
      try {
        await withTimeout(proxy.destroy(), 5_000, 'destroy')
      } catch {
        // force terminate below
      }
    }
    teardown()
  } finally {
    // Late onerror / Comlink noise can arrive after terminate().
    window.setTimeout(() => {
      suppressWorkerErrors = Math.max(0, suppressWorkerErrors - 1)
    }, 100)
  }
}
