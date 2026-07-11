import { describe, expect, it } from 'vitest'
import { computeMaskBounds, cropMaskBitmap, expandMaskBitmap } from './mask-bitmap'

describe('mask-bitmap', () => {
  it('computes bounds for a non-empty mask', () => {
    const width = 6
    const height = 4
    const data = new Uint8Array(width * height)
    data[1 * width + 2] = 255
    data[2 * width + 4] = 255

    expect(computeMaskBounds(data, width, height)).toEqual({
      x: 2,
      y: 1,
      width: 3,
      height: 2
    })
  })

  it('crops and expands a mask bitmap', () => {
    const width = 5
    const height = 5
    const data = new Uint8Array(width * height)
    data[2 * width + 2] = 255
    const bounds = { x: 1, y: 1, width: 3, height: 3 }

    const cropped = cropMaskBitmap(data, width, bounds)
    expect(cropped[1 * bounds.width + 1]).toBe(255)

    const expanded = expandMaskBitmap(cropped, bounds.width, bounds, width, height)
    expect(expanded[2 * width + 2]).toBe(255)
  })
})
