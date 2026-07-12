import { describe, expect, it } from 'vitest'
import { analyzeMaskTopology, binarizeMask, isSimplePolygon } from './validate'

describe('validate', () => {
  it('binarizes mask values', () => {
    const input = new Uint8Array([0, 1, 128, 255])
    expect(Array.from(binarizeMask(input))).toEqual([0, 255, 255, 255])
  })

  it('detects a simple square mask as valid topology', () => {
    const width = 5
    const height = 5
    const mask = new Uint8Array(width * height)
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        mask[y * width + x] = 255
      }
    }

    const analysis = analyzeMaskTopology(mask, width, height)
    expect(analysis.valid).toBe(true)
    expect(analysis.islands).toHaveLength(0)
    expect(analysis.holes).toHaveLength(0)
  })

  it('flags a single-pixel enclosed hole', () => {
    const width = 5
    const height = 5
    const mask = new Uint8Array(width * height)
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        mask[y * width + x] = 255
      }
    }
    mask[2 * width + 2] = 0

    const analysis = analyzeMaskTopology(mask, width, height)
    expect(analysis.valid).toBe(false)
    expect(analysis.holes).toHaveLength(1)
    expect(analysis.holes[0].pixels).toHaveLength(1)
  })

  it('detects islands and larger holes', () => {
    const width = 12
    const height = 12
    const mask = new Uint8Array(width * height)

    for (let y = 1; y <= 10; y++) {
      for (let x = 1; x <= 7; x++) {
        mask[y * width + x] = 255
      }
    }
    for (let y = 3; y <= 6; y++) {
      for (let x = 3; x <= 6; x++) {
        mask[y * width + x] = 0
      }
    }

    for (let y = 1; y <= 8; y++) {
      for (let x = 9; x <= 10; x++) {
        mask[y * width + x] = 255
      }
    }

    const analysis = analyzeMaskTopology(mask, width, height)
    expect(analysis.valid).toBe(false)
    expect(analysis.islands.length).toBeGreaterThanOrEqual(1)
    expect(analysis.holes.length).toBeGreaterThanOrEqual(1)
  })

  it('treats corner-only contact as disconnected (4-connected)', () => {
    const width = 8
    const height = 8
    const mask = new Uint8Array(width * height)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        mask[y * width + x] = 255
      }
    }
    for (let y = 4; y < 8; y++) {
      for (let x = 4; x < 8; x++) {
        mask[y * width + x] = 255
      }
    }

    const analysis = analyzeMaskTopology(mask, width, height)
    expect(analysis.valid).toBe(false)
    expect(analysis.islands.length).toBeGreaterThanOrEqual(1)
  })

  it('detects self-intersecting polygons', () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 }
    ]
    expect(isSimplePolygon(bowtie)).toBe(false)
  })
})
