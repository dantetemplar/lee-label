#!/usr/bin/env node
/**
 * Isolate SAM2.1-tiny WebGPU box-decode failure.
 * Same encode → try decode variants; optionally wasm decode with copied embeds.
 *
 *   electron harness-sam2-box.mjs --backend=webgpu
 */
import { app, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../../..')
const ORT = join(ROOT, 'node_modules/onnxruntime-web/dist')
const MODELS = join(process.env.HOME || '', '.config/Lee Label/Models')
const IMAGE = join(ROOT, 'test-image.png')
const GT_TXT = join(ROOT, 'test-image.txt')
const backend =
  process.argv.find((a) => a.startsWith('--backend='))?.slice('--backend='.length) || 'webgpu'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'bench',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])
app.commandLine.appendSwitch('enable-features', 'Vulkan,WebGPU')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-unsafe-webgpu')
app.commandLine.appendSwitch('enable-dawn-features', 'vulkan_enable_f16_on_nvidia')

app.whenReady().then(async () => {
  protocol.handle('bench', (req) => {
    const u = new URL(req.url)
    let rel = decodeURIComponent(u.pathname.replace(/^\//, ''))
    if (rel.startsWith('ort/')) return net.fetch(pathToFileURL(join(ORT, rel.slice(4))).href)
    if (rel === 'models/encoder') {
      const ortp = join(MODELS, 'models/sam2.1-tiny/v1/encoder.ort')
      const onnx = join(MODELS, 'models/sam2.1-tiny/v1/encoder.onnx')
      return net.fetch(pathToFileURL(existsSync(ortp) ? ortp : onnx).href)
    }
    if (rel === 'models/decoder') {
      return net.fetch(pathToFileURL(join(MODELS, 'models/sam2.1-tiny/v1/decoder.onnx')).href)
    }
    if (rel === 'fixture.png') return net.fetch(pathToFileURL(IMAGE).href)
    if (rel === 'fixture.txt') return net.fetch(pathToFileURL(GT_TXT).href)
    if (rel === 'config.json') {
      return new Response(JSON.stringify({ backend }), {
        headers: { 'content-type': 'application/json' }
      })
    }
    if (!rel) rel = 'harness-sam2-box.html'
    return net.fetch(pathToFileURL(join(__dirname, rel)).href)
  })

  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'probe-sam3-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  ipcMain.handle('sam3:log', (_e, m) => console.log(m))
  ipcMain.handle('sam3:vram-start', async () => ({ baselineMiB: 0 }))
  ipcMain.handle('sam3:vram-stop', async () => ({ peakMiB: 0 }))
  const ready = new Promise((r) => {
    ipcMain.handle('sam3:ready', () => {
      r()
      return true
    })
  })
  await win.loadURL('bench://app/harness-sam2-box.html')
  await ready
  const result = await win.webContents.executeJavaScript('window.__run()', true)
  console.log('__RESULT__' + JSON.stringify(result, null, 2))
  app.exit(result.ok ? 0 : 2)
})
