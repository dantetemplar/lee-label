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
