#!/usr/bin/env node
/**
 * SAM3 Tracker WebGPU probe: vision_encoder_fp16 + prompt_encoder_mask_decoder (fp32).
 * Usage: pnpm exec electron scripts/models-experiments/bench/probe-sam3.mjs
 */
import { app, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../../..')
const ORT_DIST = join(ROOT, 'node_modules/onnxruntime-web/dist')
const SAM3 = join(ROOT, '.tmp/sam3-tracker/inlined')
const JAM = join(ROOT, '.tmp/sam3-jamjamjon')
const ENC_FP16 = existsSync(join(JAM, 'tracker-vision-encoder-fp16.onnx'))
  ? join(JAM, 'tracker-vision-encoder-fp16.onnx')
  : join(SAM3, 'encoder.fp16.onnx')
const ENC_Q4 = join(SAM3, 'encoder.q4.onnx')
const DEC = existsSync(join(JAM, 'tracker-prompt-encoder-mask-decoder.onnx'))
  ? join(JAM, 'tracker-prompt-encoder-mask-decoder.onnx')
  : join(SAM3, 'decoder.fp32.onnx')
const APP_ENC = join(
  process.env.HOME || '',
  '.config/Lee Label/Models/models/sam3-tracker/v1/encoder.onnx'
)
const APP_DEC = join(
  process.env.HOME || '',
  '.config/Lee Label/Models/models/sam3-tracker/v1/decoder.onnx'
)
const FIXTURE = join(
  process.env.HOME || '',
  '.cursor/projects/home-dante-Projects-lee-label/assets/image-2d4c69f9-0dbf-46e4-af36-ab3b5e98fc1f.png'
)
const TIMEOUT_MS = 600_000
const MODE =
  process.argv.find((a) => a.startsWith('--mode='))?.slice('--mode='.length) || 'gpu-both-fp16'

const encFp16 = existsSync(ENC_FP16) ? ENC_FP16 : APP_ENC
const encQ4 = existsSync(ENC_Q4) ? ENC_Q4 : null
const decPath = existsSync(DEC) ? DEC : APP_DEC
if (!existsSync(encFp16) || !existsSync(decPath)) {
  console.error('Missing SAM3 models', { encFp16, decPath })
  process.exit(1)
}
if (MODE.includes('q4') && !encQ4) {
  console.error('Missing q4 encoder', ENC_Q4)
  process.exit(1)
}
console.log('mode', MODE, 'enc', encFp16, 'dec', decPath)

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

app.whenReady().then(async () => {
  protocol.handle('bench', (request) => {
    const url = new URL(request.url)
    let rel = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (!rel || rel === '') rel = 'probe-sam3.html'
    if (rel.startsWith('ort/')) {
      return net.fetch(pathToFileURL(join(ORT_DIST, rel.slice(4))).href)
    }
    if (rel === 'models/encoder.fp16.onnx') {
      return net.fetch(pathToFileURL(encFp16).href)
    }
    if (rel === 'models/encoder.q4.onnx' && encQ4) {
      return net.fetch(pathToFileURL(encQ4).href)
    }
    if (rel === 'models/decoder.fp32.onnx') {
      return net.fetch(pathToFileURL(decPath).href)
    }
    if (rel === 'fixture.png' && existsSync(FIXTURE)) {
      return net.fetch(pathToFileURL(FIXTURE).href)
    }
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

  let vramSamples = []
  let vramTimer = null
  let baseline = 0

  ipcMain.handle('sam3:log', (_e, msg) => console.log(msg))
  ipcMain.handle('sam3:vram-start', async () => {
    baseline = await queryVramMiB()
    vramSamples = [{ usedMiB: baseline, ts: Date.now() }]
    vramTimer = setInterval(() => {
      void queryVramMiB().then((usedMiB) => {
        if (Number.isFinite(usedMiB)) vramSamples.push({ usedMiB, ts: Date.now() })
      })
    }, 200)
    return { baselineMiB: baseline }
  })
  ipcMain.handle('sam3:vram-stop', () => {
    if (vramTimer) clearInterval(vramTimer)
    vramTimer = null
    const peak = vramSamples.reduce((m, s) => Math.max(m, s.usedMiB || 0), 0)
    return {
      baselineMiB: baseline,
      peakMiB: peak,
      deltaMiB: peak - baseline,
      samples: vramSamples.length
    }
  })

  const ready = new Promise((resolve) => {
    ipcMain.handle('sam3:ready', () => {
      resolve(undefined)
      return true
    })
  })

  await win.loadURL(`bench://app/probe-sam3.html?mode=${encodeURIComponent(MODE)}`)
  await ready

  let result
  try {
    result = await Promise.race([
      win.webContents.executeJavaScript('window.__runSam3()', true),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
      )
    ])
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  console.log(`__SAM3_RESULT__${JSON.stringify(result)}__END__`)
  app.exit(result.ok ? 0 : 2)
})
