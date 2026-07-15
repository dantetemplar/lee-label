#!/usr/bin/env node
/**
 * Electron WebGPU SAM bench: load / encode / segment timings + peak VRAM (nvidia-smi).
 *
 * Runs each model in a fresh Electron process so WebGPU OOM cannot poison the rest.
 *
 * Usage:
 *   pnpm bench:sam
 *   pnpm bench:sam -- --model=sam2.1-tiny
 *   pnpm bench:sam -- --variant=baseline|gpu-io|graph-capture|opt-all
 */
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'

const require = createRequire(import.meta.url)
const electron = require('electron')
const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, 'out')

const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    model: { type: 'string' },
    variant: { type: 'string', default: 'baseline' },
    'all-variants': { type: 'boolean', default: false },
    'models-dir': { type: 'string' },
    'skip-missing': { type: 'boolean', default: true },
    timeout: { type: 'string', default: '180000' }
  },
  strict: false
})

const VARIANTS = ['baseline', 'gpu-io', 'graph-capture', 'opt-all']
const VARIANT_LIST = args['all-variants'] ? VARIANTS : [String(args.variant || 'baseline')]
const MODELS_DIR =
  args['models-dir'] || join(process.env.HOME || '', '.config/Lee Label/Models')
const TIMEOUT_MS = Number(args.timeout) || 180_000

const registry = JSON.parse(readFileSync(join(__dirname, 'models.json'), 'utf8'))
const models = registry.filter((m) => {
  if (args.model && m.id !== args.model) return false
  const encOrt = join(MODELS_DIR, m.encoderKey)
  const encOnnx = join(MODELS_DIR, m.encoderKey.replace(/\.ort$/, '.onnx'))
  const enc = existsSync(encOrt) ? encOrt : encOnnx
  const dec = join(MODELS_DIR, m.decoderKey)
  if (!existsSync(enc) || !existsSync(dec)) {
    if (args['skip-missing']) {
      console.warn(`[skip] ${m.id}: missing under ${MODELS_DIR}`)
      return false
    }
    throw new Error(`Missing ${m.id}`)
  }
  return true
})

function runOne(modelId, variant) {
  return new Promise((resolve) => {
    const child = spawn(
      electron,
      [
        join(__dirname, 'electron-main.mjs'),
        `--variant=${variant}`,
        `--model=${modelId}`,
        `--models-dir=${MODELS_DIR}`,
        `--timeout=${TIMEOUT_MS}`
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
      }
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      const s = d.toString()
      stdout += s
      process.stdout.write(s)
    })
    child.stderr.on('data', (d) => {
      const s = d.toString()
      stderr += s
      // Keep GPU noise down unless it is a one-liner status
      if (!s.includes('GPUDevice:') && !s.includes('vkAllocateMemory')) {
        process.stderr.write(s)
      }
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({
        id: modelId,
        ok: false,
        error: `timeout after ${TIMEOUT_MS}ms`,
        variant
      })
    }, TIMEOUT_MS + 15_000)

    child.on('exit', () => {
      clearTimeout(timer)
      const marker = stdout.match(/__BENCH_RESULT__({.*})__END__/)
      if (marker) {
        try {
          resolve(JSON.parse(marker[1]))
          return
        } catch {
          /* fall through */
        }
      }
      resolve({
        id: modelId,
        ok: false,
        error: `no result (exit). stderrTail=${stderr.slice(-400)}`,
        variant
      })
    })
  })
}

mkdirSync(OUT_DIR, { recursive: true })

const allResults = []
for (const variant of VARIANT_LIST) {
  console.log(`\n=== SAM bench variant=${variant} models=${models.length} (isolated) ===\n`)
  const results = []
  for (const m of models) {
    console.log(`→ ${m.id} [${variant}] ...`)
    const r = await runOne(m.id, variant)
    results.push(r)
    allResults.push(r)
    const status = r.ok ? 'OK' : 'FAIL'
    const vram = r.vram?.peakMiB != null ? `peak ${Number(r.vram.peakMiB).toFixed(0)} MiB (Δ${Number(r.vram.deltaMiB).toFixed(0)})` : 'VRAM n/a'
    console.log(
      `  ${status} load=${fmt(r.loadMs)} encode=${fmt(r.encodeMs)} seg=${fmt(r.segmentMs)} ${vram}` +
        (r.error ? ` err=${r.error}` : '') +
        (r.ok
          ? ` score=${fmt(r.score, 3)} cover=${(r.centerCoverage * 100).toFixed(1)}%`
          : '')
    )
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const gpuName = await queryGpu()
  const payload = { variant, modelsDir: MODELS_DIR, gpu: gpuName, results }
  const outPath = join(OUT_DIR, `bench-${variant}-${stamp}.json`)
  writeFileSync(outPath, JSON.stringify(payload, null, 2))
  writeFileSync(join(OUT_DIR, `bench-${variant}-latest.json`), JSON.stringify(payload, null, 2))
  console.log(`\nWrote ${outPath}\n`)
  printTable(results)
}

if (VARIANT_LIST.length > 1) {
  console.log('\n=== Cross-variant summary (best encode ms per model) ===\n')
  const byModel = new Map()
  for (const r of allResults) {
    const row = byModel.get(r.id) || { id: r.id }
    row[r.variant] = r.ok ? `${fmt(r.encodeMs)}ms Δ${fmt(r.vram?.deltaMiB)}` : `FAIL: ${r.error?.slice(0, 40)}`
    byModel.set(r.id, row)
  }
  for (const row of byModel.values()) {
    console.log(row.id)
    for (const v of VARIANT_LIST) console.log(`  ${v}: ${row[v] ?? '-'}`)
  }
}

process.exit(allResults.some((r) => !r.ok && r.variant === 'baseline') ? 2 : 0)

async function queryGpu() {
  return new Promise((r) => {
    const p = spawn('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader'])
    let o = ''
    p.stdout.on('data', (d) => (o += d))
    p.on('close', () => r(o.trim() || 'unknown'))
    p.on('error', () => r('unknown'))
  })
}

function printTable(results) {
  console.log('| model | ok | load ms | encode ms | segment ms | peak MiB | ΔVRAM | score | center% |')
  console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const r of results) {
    console.log(
      `| ${r.id} | ${r.ok ? 'yes' : 'no'} | ${fmt(r.loadMs)} | ${fmt(r.encodeMs)} | ${fmt(r.segmentMs)} | ${fmt(r.vram?.peakMiB)} | ${fmt(r.vram?.deltaMiB)} | ${fmt(r.score, 3)} | ${r.centerCoverage != null ? (r.centerCoverage * 100).toFixed(1) : '-'} |`
    )
  }
}

function fmt(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '-'
  return Number(n).toFixed(digits)
}
