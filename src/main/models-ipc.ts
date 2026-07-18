import { app, ipcMain, net, protocol } from 'electron'
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { pathToFileURL } from 'url'
import extract from 'extract-zip'
import {
  WEBSAM_MODEL_REGISTRY,
  getWebsamModelById,
  getWebsamModelDownloadUrl,
  type WebsamDownloadProgress,
  type WebsamModelFileUrls,
  type WebsamModelStatus
} from '../shared/websam-models'
import { WEBSAM_MODEL_SCHEME } from './protocols'

const SCHEME = WEBSAM_MODEL_SCHEME
const CACHE_DIR_NAME = 'Models'

let activeDownloadAbort: AbortController | null = null
let activeDownloadId: string | null = null

export function getModelsCacheRoot(): string {
  return join(app.getPath('userData'), CACHE_DIR_NAME)
}

function modelFilePath(relativeKey: string): string {
  return join(getModelsCacheRoot(), relativeKey)
}

function isModelCached(encoderKey: string, decoderKey: string, extraKeys: string[] = []): boolean {
  if (!existsSync(modelFilePath(encoderKey)) || !existsSync(modelFilePath(decoderKey))) {
    return false
  }
  return extraKeys.every((key) => existsSync(modelFilePath(key)))
}

function toProtocolUrl(relativeKey: string): string {
  return `${SCHEME}://local/${relativeKey.split('/').map(encodeURIComponent).join('/')}`
}

export function setupWebsamModelProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url)
    const relativeKey = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (!relativeKey || relativeKey.includes('..')) {
      return new Response('Not found', { status: 404 })
    }
    const filePath = modelFilePath(relativeKey)
    if (!existsSync(filePath)) {
      return new Response('Not found', { status: 404 })
    }
    const response = await net.fetch(pathToFileURL(filePath).href)
    const headers = new Headers(response.headers)
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  })
}

function sendProgress(sender: Electron.WebContents, progress: WebsamDownloadProgress): void {
  if (!sender.isDestroyed()) {
    sender.send('models:download-progress', progress)
  }
}

async function downloadZipToFile(
  url: string,
  destPath: string,
  signal: AbortSignal,
  onBytes: (received: number, total: number) => void
): Promise<void> {
  const response = await fetch(url, { signal, redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  }

  const total = Number(response.headers.get('content-length')) || 0
  if (!response.body) {
    throw new Error('Download response has no body')
  }

  mkdirSync(join(destPath, '..'), { recursive: true })

  const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream)
  let received = 0
  nodeStream.on('data', (chunk: Buffer) => {
    received += chunk.length
    onBytes(received, total)
  })

  await pipeline(nodeStream, createWriteStream(destPath))
  onBytes(received, total || received)
}

export function registerModelsIpc(): void {
  mkdirSync(getModelsCacheRoot(), { recursive: true })

  ipcMain.handle('models:list-status', (): WebsamModelStatus[] => {
    return WEBSAM_MODEL_REGISTRY.map((model) => ({
      id: model.id,
      cached: isModelCached(model.encoderKey, model.decoderKey),
      totalSize: model.totalSize
    }))
  })

  ipcMain.handle('models:get-file-urls', (_, modelId: string): WebsamModelFileUrls | null => {
    const model = getWebsamModelById(modelId)
    if (!model) return null
    if (!isModelCached(model.encoderKey, model.decoderKey)) return null
    return {
      encoderUrl: toProtocolUrl(model.encoderKey),
      decoderUrl: toProtocolUrl(model.decoderKey)
    }
  })

  ipcMain.handle('models:download', async (event, modelId: string) => {
    const model = getWebsamModelById(modelId)
    if (!model) throw new Error(`Unknown model: ${modelId}`)

    if (isModelCached(model.encoderKey, model.decoderKey)) {
      sendProgress(event.sender, {
        id: modelId,
        stage: 'done',
        received: model.totalSize,
        total: model.totalSize
      })
      return { ok: true as const }
    }

    activeDownloadAbort?.abort()
    const controller = new AbortController()
    activeDownloadAbort = controller
    activeDownloadId = modelId

    const cacheRoot = getModelsCacheRoot()
    const zipPath = join(cacheRoot, `.tmp-${modelId}.zip`)
    const extractTmp = join(cacheRoot, `.tmp-extract-${modelId}`)

    try {
      sendProgress(event.sender, {
        id: modelId,
        stage: 'downloading',
        received: 0,
        total: model.totalSize
      })

      const url = getWebsamModelDownloadUrl(model)
      await downloadZipToFile(url, zipPath, controller.signal, (received, total) => {
        sendProgress(event.sender, {
          id: modelId,
          stage: 'downloading',
          received,
          total: total || model.totalSize
        })
      })

      if (controller.signal.aborted) {
        throw new Error('Download cancelled')
      }

      sendProgress(event.sender, {
        id: modelId,
        stage: 'extracting',
        received: model.totalSize,
        total: model.totalSize
      })

      rmSync(extractTmp, { recursive: true, force: true })
      mkdirSync(extractTmp, { recursive: true })
      await extract(zipPath, { dir: extractTmp })

      // Release zips are either models/<id>/v1/* or <id>/v1/* — normalize to models/<id>/
      const { cpSync } = await import('fs')
      const destModelDir = join(cacheRoot, 'models', modelId)
      const extractedWithPrefix = join(extractTmp, 'models', modelId)
      const extractedFlat = join(extractTmp, modelId)
      const sourceDir = existsSync(extractedWithPrefix)
        ? extractedWithPrefix
        : existsSync(extractedFlat)
          ? extractedFlat
          : null

      if (!sourceDir) {
        throw new Error(
          `Extracted archive has unexpected layout for ${modelId} (expected ${modelId}/v1/…)`
        )
      }

      rmSync(destModelDir, { recursive: true, force: true })
      mkdirSync(join(cacheRoot, 'models'), { recursive: true })
      cpSync(sourceDir, destModelDir, { recursive: true })

      if (!isModelCached(model.encoderKey, model.decoderKey)) {
        throw new Error(
          `Extracted archive missing expected files for ${modelId} (${model.encoderKey}, ${model.decoderKey})`
        )
      }

      sendProgress(event.sender, {
        id: modelId,
        stage: 'done',
        received: model.totalSize,
        total: model.totalSize
      })
      return { ok: true as const }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const cancelled = controller.signal.aborted || message.includes('abort')
      sendProgress(event.sender, {
        id: modelId,
        stage: 'error',
        received: 0,
        total: model.totalSize,
        error: cancelled ? 'Download cancelled' : message
      })
      if (cancelled) {
        return { ok: false as const, cancelled: true as const }
      }
      throw err
    } finally {
      rmSync(zipPath, { force: true })
      rmSync(extractTmp, { recursive: true, force: true })
      if (activeDownloadAbort === controller) {
        activeDownloadAbort = null
        activeDownloadId = null
      }
    }
  })

  ipcMain.handle('models:cancel-download', () => {
    activeDownloadAbort?.abort()
    return activeDownloadId
  })
}
