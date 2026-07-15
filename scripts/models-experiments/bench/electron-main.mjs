#!/usr/bin/env node
import { app, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { parseArgs } from 'node:util'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../../..')
const ORT_DIST = join(ROOT, 'node_modules/onnxruntime-web/dist')

const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    model: { type: 'string' },
    variant: { type: 'string', default: 'baseline' },
    'models-dir': { type: 'string' },
    timeout: { type: 'string', default: '180000' }
  },
  strict: false
})

const MODELS_DIR =
  args['models-dir'] || join(process.env.HOME || '', '.config/Lee Label/Models')
const VARIANT = String(args.variant || 'baseline')
const ONLY_MODEL = args.model ? String(args.model) : null
const TIMEOUT_MS = Number(args.timeout) || 180_000

if (!ONLY_MODEL) {
  console.error('electron-main expects --model=<id> (use main.mjs to run all)')
  process.exit(1)
}

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

let vramSamples = []
let vramTimer = null
let baselineVramMiB = 0

function queryVramMiB() {
  return new Promise((resolve) => {
    const p = spawn('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits'])
    let out = ''
    p.stdout.on('data', (d) => {
      out += d.toString()
    })
    p.on('close', () => {
      const n = Number.parseFloat(out.trim().split('\n')[0] || '')
      resolve(Number.isFinite(n) ? n : NaN)
    })
    p.on('error', () => resolve(NaN))
  })
}

async function startVramMonitor() {
  baselineVramMiB = await queryVramMiB()
  vramSamples = [{ usedMiB: baselineVramMiB, ts: Date.now() }]
  vramTimer = setInterval(() => {
    void queryVramMiB().then((usedMiB) => {
      if (Number.isFinite(usedMiB)) vramSamples.push({ usedMiB, ts: Date.now() })
    })
  }, 100)
}

function stopVramMonitor() {
  if (vramTimer) clearInterval(vramTimer)
  vramTimer = null
  const peak = vramSamples.reduce((m, s) => Math.max(m, s.usedMiB || 0), 0)
  return {
    baselineMiB: baselineVramMiB,
    peakMiB: peak,
    deltaMiB: peak - baselineVramMiB,
    samples: vramSamples.length
  }
}

function loadModelMeta() {
  const all = JSON.parse(readFileSync(join(__dirname, 'models.json'), 'utf8'))
  const model = all.find((m) => m.id === ONLY_MODEL)
  if (!model) throw new Error(`Unknown model ${ONLY_MODEL}`)
  const encOrt = join(MODELS_DIR, model.encoderKey)
  const encOnnx = join(MODELS_DIR, model.encoderKey.replace(/\.ort$/, '.onnx'))
  const enc = existsSync(encOrt) ? encOrt : encOnnx
  const dec = join(MODELS_DIR, model.decoderKey)
  if (!existsSync(enc) || !existsSync(dec)) throw new Error(`Missing files for ${ONLY_MODEL}`)
  return { ...model, encoderKey: enc.endsWith('.onnx') ? model.encoderKey.replace(/\.ort$/, '.onnx') : model.encoderKey }
}

app.commandLine.appendSwitch('enable-features', 'Vulkan,WebGPU')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-unsafe-webgpu')
app.commandLine.appendSwitch('enable-dawn-features', 'vulkan_enable_f16_on_nvidia')

app.whenReady().then(async () => {
  protocol.handle('bench', (request) => {
    const url = new URL(request.url)
    let rel = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (!rel || rel === '') rel = 'index.html'
    if (rel.startsWith('ort/')) {
      return net.fetch(pathToFileURL(join(ORT_DIST, rel.slice(4))).href)
    }
    return net.fetch(pathToFileURL(join(__dirname, rel)).href)
  })

  const model = loadModelMeta()

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  ipcMain.handle('bench:get-config', () => ({
    variant: VARIANT,
    imageSize: 512,
    modelsDir: MODELS_DIR,
    timeoutMs: TIMEOUT_MS
  }))

  ipcMain.handle('bench:read-model', (_e, modelId) => {
    if (modelId !== model.id) throw new Error(`Expected ${model.id}`)
    const enc = readFileSync(join(MODELS_DIR, model.encoderKey))
    const dec = readFileSync(join(MODELS_DIR, model.decoderKey))
    return {
      model,
      encoderBuffer: enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength),
      decoderBuffer: dec.buffer.slice(dec.byteOffset, dec.byteOffset + dec.byteLength)
    }
  })

  ipcMain.handle('bench:vram-start', async () => {
    await startVramMonitor()
    return { baselineMiB: baselineVramMiB }
  })

  ipcMain.handle('bench:vram-stop', () => stopVramMonitor())
  ipcMain.handle('bench:log', (_e, msg) => {
    console.log(msg)
  })

  const readyPromise = new Promise((resolve) => {
    ipcMain.handle('bench:ready', () => {
      resolve(undefined)
      return true
    })
  })

  await win.loadURL('bench://app/index.html')
  await readyPromise

  let result
  try {
    result = await Promise.race([
      win.webContents.executeJavaScript(`window.__runBench(${JSON.stringify(model.id)})`, true),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
      )
    ])
  } catch (err) {
    result = {
      id: model.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      variant: VARIANT,
      vram: stopVramMonitor()
    }
  }

  console.log(`__BENCH_RESULT__${JSON.stringify(result)}__END__`)
  app.exit(result.ok ? 0 : 2)
})

app.on('window-all-closed', () => {})
