import { describe, expect, it } from 'vitest'
import { rasterizePolygon } from './rasterize'

describe('rasterizePolygon', () => {
  it('fills interior pixels of a triangle', () => {
    const mask = rasterizePolygon(
      [
        { x: 1, y: 1 },
        { x: 6, y: 1 },
        { x: 1, y: 6 }
      ],
      8,
      8
    )

    expect(mask[2 * 8 + 2]).toBe(255)
    expect(mask[0 * 8 + 0]).toBe(0)
    expect(mask[7 * 8 + 7]).toBe(0)
  })

  it('returns empty mask for degenerate polygons', () => {
    const mask = rasterizePolygon(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 }
      ],
      4,
      4
    )
    expect(mask.every((value) => value === 0)).toBe(true)
  })
})
