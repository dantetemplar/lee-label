import { describe, expect, it } from 'vitest'
import { repairMaskTopology } from './repair'

describe('repair', () => {
  it('fills enclosed holes in a mask', () => {
    const width = 5
    const height = 5
    const mask = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
          mask[y * width + x] = 255
        }
      }
    }

    const repaired = repairMaskTopology(mask, width, height)
    expect(repaired[2 * width + 2]).toBe(255)
  })
})
