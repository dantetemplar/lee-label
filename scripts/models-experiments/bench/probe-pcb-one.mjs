#!/usr/bin/env node
/** Isolated Electron process: one model PCB probe. */
import { app, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../../..')
const ORT = join(ROOT, 'node_modules/onnxruntime-web/dist')
const FIXTURE = join(
  process.env.HOME || '',
  '.cursor/projects/home-dante-Projects-lee-label/assets/image-2d4c69f9-0dbf-46e4-af36-ab3b5e98fc1f.png'
)

const modelId = process.argv.find((a) => a.startsWith('--model='))?.slice('--model='.length)
const modelsDir =
  process.argv.find((a) => a.startsWith('--models-dir='))?.slice('--models-dir='.length) ||
  join(process.env.HOME || '', '.config/Lee Label/Models')

if (!modelId) {
  console.error('missing --model=')
  process.exit(1)
}

const registry = JSON.parse(
  readFileSync(join(ROOT, 'scripts/models-experiments/bench/models.json'), 'utf8')
)
let model = registry.find((m) => m.id === modelId)
if (!model) {
  // fallback from shared registry fields we need
  const shared = {
    'sam3-tracker': {
      id: 'sam3-tracker',
      family: 'sam3',
      variant: 'tracker',
      requiresWebGPU: true,
      encoderKey: 'models/sam3-tracker/v1/encoder.onnx',
      decoderKey: 'models/sam3-tracker/v1/decoder.onnx',
      quantization: 'fp16'
    }
  }
  model = shared[modelId]
}
if (!model) {
  console.error('unknown model', modelId)
  process.exit(1)
}

const encOrt = join(modelsDir, model.encoderKey)
const encOnnx = join(modelsDir, model.encoderKey.replace(/\.ort$/, '.onnx'))
const encPath = existsSync(encOrt) ? encOrt : encOnnx
const decPath = join(modelsDir, model.decoderKey)

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

function vram() {
  return new Promise((resolve) => {
    const p = spawn('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits'])
    let out = ''
    p.stdout.on('data', (d) => {
      out += d.toString()
    })
    p.on('close', () => resolve(Number.parseFloat(out.trim().split('\n')[0]) || NaN))
    p.on('error', () => resolve(NaN))
  })
}

app.whenReady().then(async () => {
  protocol.handle('bench', (req) => {
    const u = new URL(req.url)
    let rel = decodeURIComponent(u.pathname.replace(/^\//, ''))
    if (rel.startsWith('ort/')) return net.fetch(pathToFileURL(join(ORT, rel.slice(4))).href)
    if (rel === 'models/encoder') return net.fetch(pathToFileURL(encPath).href)
    if (rel === 'models/decoder') return net.fetch(pathToFileURL(decPath).href)
    if (rel === 'models/language_mask.bin') {
      const p = join(modelsDir, `models/${modelId}/v1/language_mask.bin`)
      return net.fetch(pathToFileURL(p).href)
    }
    if (rel === 'models/language_features.bin') {
      const p = join(modelsDir, `models/${modelId}/v1/language_features.bin`)
      return net.fetch(pathToFileURL(p).href)
    }
    if (rel === 'fixture.png') return net.fetch(pathToFileURL(FIXTURE).href)
    if (rel === 'model.json') {
      return new Response(JSON.stringify(model), {
        headers: { 'content-type': 'application/json' }
      })
    }
    if (!rel) rel = 'probe-pcb.html'
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

  let baseline = 0
  let samples = []
  let timer = null
  ipcMain.handle('sam3:log', (_e, m) => console.log(m))
  ipcMain.handle('sam3:vram-start', async () => {
    baseline = await vram()
    samples = [{ usedMiB: baseline }]
    timer = setInterval(async () => {
      const u = await vram()
      if (Number.isFinite(u)) samples.push({ usedMiB: u })
    }, 200)
    return { baselineMiB: baseline }
  })
  ipcMain.handle('sam3:vram-stop', () => {
    if (timer) clearInterval(timer)
    const peak = samples.reduce((m, s) => Math.max(m, s.usedMiB || 0), 0)
    return {
      baselineMiB: baseline,
      peakMiB: peak,
      deltaMiB: peak - baseline,
      samples: samples.length
    }
  })

  const ready = new Promise((r) => {
    ipcMain.handle('sam3:ready', () => {
      r()
      return true
    })
  })

  await win.loadURL('bench://app/probe-pcb.html')
  await ready
  let result
  try {
    result = await Promise.race([
      win.webContents.executeJavaScript('window.__runPcb()', true),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 280_000))
    ])
  } catch (err) {
    result = { id: modelId, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  console.log(`__PCB_RESULT__${JSON.stringify(result)}__END__`)
  app.exit(result.ok ? 0 : 2)
})
