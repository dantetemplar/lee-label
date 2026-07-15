#!/usr/bin/env node
/** Regenerate models.json from src/shared/websam-models.ts (bench metadata only). */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(__dirname, '../../../src/shared/websam-models.ts'), 'utf8')

const blocks = [...src.matchAll(/\{\s*\n\s*id: '([^']+)'[\s\S]*?\n\s*\}/g)]
const models = []

for (const block of blocks) {
  const chunk = block[0]
  const id = block[1]
  if (!chunk.includes('encoderKey:')) continue

  const pick = (re) => chunk.match(re)?.[1]
  const family = pick(/family: '([^']+)'/)
  const name = pick(/name: '([^']+)'/)
  const encoderKey = pick(/encoderKey: '([^']+)'/)
  const decoderKey = pick(/decoderKey: '([^']+)'/)
  const requiresWebGPU = /requiresWebGPU: true/.test(chunk)
  const intermMatch = chunk.match(/intermDims: \[([^\]]+)\]/)

  if (!family || !encoderKey || !decoderKey) continue

  const entry = {
    id,
    name,
    family,
    encoderKey,
    decoderKey,
    requiresWebGPU,
    quantization: pick(/quantization: '([^']+)'/) || 'fp32'
  }
  const variant = pick(/variant: '([^']+)'/)
  if (variant) entry.variant = variant
  if (intermMatch) {
    entry.intermDims = intermMatch[1].split(',').map((n) => Number.parseInt(n.trim(), 10))
  }
  models.push(entry)
}

writeFileSync(join(__dirname, 'models.json'), JSON.stringify(models, null, 2) + '\n')
console.log(`Wrote ${models.length} models to scripts/models-experiments/bench/models.json`)
