#!/usr/bin/env node
/**
 * GT prompt harness driver — Electron webgpu + wasm for all non-large models.
 *
 *   node scripts/models-experiments/bench/harness-all.mjs
 *   node scripts/models-experiments/bench/harness-all.mjs --model=sam-hq-tiny
 *   node scripts/models-experiments/bench/harness-all.mjs --backend=webgpu
 *   node scripts/models-experiments/bench/harness-all.mjs --backend=wasm
 */
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electron = require('electron')
const __dirname = dirname(fileURLToPath(import.meta.url))
const MODELS = join(process.env.HOME || '', '.config/Lee Label/Models')
const OUT = join(__dirname, 'out')
mkdirSync(OUT, { recursive: true })

const ALL = [
  'sam-hq-tiny',
  'sam-hq-base',
  'sam2.1-tiny',
  'sam2.1-small',
  'sam2.1-baseplus',
  'sam3-tracker',
  'edgesam'
]

const only = process.argv.find((a) => a.startsWith('--model='))?.slice('--model='.length)
const backendArg = process.argv.find((a) => a.startsWith('--backend='))?.slice('--backend='.length)
const models = (only ? [only] : ALL).filter((id) => !id.includes('large'))
const backends = backendArg ? [backendArg] : ['webgpu', 'wasm']

function runOne(modelId, backend) {
  return new Promise((resolve) => {
    const child = spawn(
      electron,
      [
        join(__dirname, 'harness-one.mjs'),
        `--model=${modelId}`,
        `--backend=${backend}`,
        `--models-dir=${MODELS}`
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } }
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d.toString()
      process.stdout.write(d)
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ id: modelId, backend, ok: false, error: 'timeout 400s' })
    }, 400_000)
    child.on('close', () => {
      clearTimeout(timer)
      const m = stdout.match(/__HARNESS_RESULT__(.*)__END__/)
      if (m) {
        try {
          resolve(JSON.parse(m[1]))
          return
        } catch {
          /* fallthrough */
        }
      }
      resolve({
        id: modelId,
        backend,
        ok: false,
        error: (stderr || stdout).split('\n').filter(Boolean).slice(-5).join(' | ') || 'no result'
      })
    })
  })
}

function rowSummary(r) {
  const cells = ['box', 'pos_neg', 'pos_only'].map((k) => {
    const p = r.prompts?.[k]
    if (!p?.ok) return `${k}:fail`
    return `${k}:iou=${p.bestIou?.toFixed(2)}${p.note?.includes('✓') ? '✓' : p.note?.includes('✗') ? '✗' : ''}`
  })
  return cells.join(' ')
}

const results = []
console.log(`Harness models=${models.join(', ')} backends=${backends.join(',')}`)
for (const id of models) {
  const encOrt = join(MODELS, `models/${id}/v1/encoder.ort`)
  const encOnnx = join(MODELS, `models/${id}/v1/encoder.onnx`)
  const dec = join(MODELS, `models/${id}/v1/decoder.onnx`)
  if ((!existsSync(encOrt) && !existsSync(encOnnx)) || !existsSync(dec)) {
    console.log(`\n→ ${id} SKIP (missing files)`)
    results.push({ id, ok: false, error: 'missing files' })
    continue
  }
  for (const backend of backends) {
    console.log(`\n→ ${id} / ${backend} …`)
    const r = await runOne(id, backend)
    results.push(r)
    if (r.ok) {
      console.log(
        `  OK encode=${r.encodeMs?.toFixed?.(0)}ms peak=${r.vram?.peakMiB}MiB | ${rowSummary(r)}`
      )
    } else {
      console.log(`  FAIL ${r.error}`)
    }
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = join(OUT, `harness-${stamp}.json`)
writeFileSync(outPath, JSON.stringify({ fixture: 'test-image', results }, null, 2))
writeFileSync(
  join(OUT, 'harness-latest.json'),
  JSON.stringify({ fixture: 'test-image', results }, null, 2)
)

console.log('\n| model | backend | box IoU | +/- IoU | + IoU | encode | peak |')
console.log('|---|---|---:|---:|---:|---:|---:|')
for (const r of results) {
  const iou = (k) => {
    const p = r.prompts?.[k]
    if (!p?.ok) return '-'
    return p.bestIou.toFixed(3) + (p.note?.includes('✓') ? '✓' : p.note?.includes('✗') ? '✗' : '')
  }
  console.log(
    `| ${r.id} | ${r.backend || '-'} | ${iou('box')} | ${iou('pos_neg')} | ${iou('pos_only')} | ${r.encodeMs?.toFixed?.(0) ?? '-'} | ${r.vram?.peakMiB ?? '-'} |`
  )
}
console.log('\nWrote', outPath)
