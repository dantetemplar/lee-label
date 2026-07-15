#!/usr/bin/env node
/**
 * PCB capacitor-click probe for Magick Stick models (skip *large*).
 * Usage:
 *   pnpm exec electron scripts/models-experiments/bench/probe-pcb-all.mjs
 *   pnpm exec electron scripts/models-experiments/bench/probe-pcb-all.mjs --model=sam2.1-tiny
 */
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electron = require('electron')
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../../..')
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
const models = (only ? [only] : ALL).filter((id) => !id.includes('large'))

function runOne(modelId) {
  return new Promise((resolve) => {
    const child = spawn(
      electron,
      [join(__dirname, 'probe-pcb-one.mjs'), `--model=${modelId}`, `--models-dir=${MODELS}`],
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
      resolve({ id: modelId, ok: false, error: 'timeout 300s' })
    }, 300_000)
    child.on('close', () => {
      clearTimeout(timer)
      const m = stdout.match(/__PCB_RESULT__(.*)__END__/)
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
        ok: false,
        error: (stderr || stdout).split('\n').filter(Boolean).slice(-5).join(' | ') || 'no result'
      })
    })
  })
}

const results = []
console.log(`PCB probe models=${models.join(', ')}`)
for (const id of models) {
  const encOrt = join(MODELS, `models/${id}/v1/encoder.ort`)
  const encOnnx = join(MODELS, `models/${id}/v1/encoder.onnx`)
  const dec = join(MODELS, `models/${id}/v1/decoder.onnx`)
  if ((!existsSync(encOrt) && !existsSync(encOnnx)) || !existsSync(dec)) {
    console.log(`\n→ ${id} SKIP (missing files)`)
    results.push({ id, ok: false, error: 'missing files' })
    continue
  }
  console.log(`\n→ ${id} …`)
  const r = await runOne(id)
  results.push(r)
  if (r.ok) {
    console.log(
      `  OK best=${r.best} scores=[${(r.scores || []).map((s) => s.toFixed(3)).join(',')}] areas=[${(r.areas || []).map((a) => (a * 100).toFixed(2) + '%').join(',')}] encode=${r.encodeMs?.toFixed?.(0)}ms peak=${r.vram?.peakMiB}MiB`
    )
  } else {
    console.log(`  FAIL ${r.error}`)
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = join(OUT, `pcb-probe-${stamp}.json`)
writeFileSync(outPath, JSON.stringify({ fixture: 'pcb-capacitor-0.32,0.40', results }, null, 2))
writeFileSync(join(OUT, 'pcb-probe-latest.json'), JSON.stringify({ fixture: 'pcb-capacitor-0.32,0.40', results }, null, 2))

console.log('\n| model | ok | backend | best | areas | encode ms | peak MiB | note |')
console.log('|---|---|---|---:|---|---:|---:|---|')
for (const r of results) {
  const areas = (r.areas || []).map((a) => `${(a * 100).toFixed(1)}%`).join('/')
  const note = r.ok
    ? r.best != null && r.areas?.[r.best] != null && r.areas[r.best] < 0.02
      ? 'tiny✓'
      : r.areas?.[r.best] > 0.2
        ? 'large✗'
        : 'mid'
    : r.error || 'fail'
  console.log(
    `| ${r.id} | ${r.ok ? 'yes' : 'no'} | ${r.backend || '-'} | ${r.best ?? '-'} | ${areas || '-'} | ${r.encodeMs?.toFixed?.(0) ?? '-'} | ${r.vram?.peakMiB ?? '-'} | ${note} |`
  )
}
console.log('\nWrote', outPath)
