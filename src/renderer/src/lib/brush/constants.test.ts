import { describe, expect, it } from 'vitest'
import {
  MAX_BRUSH_DIAMETER_IMAGE_PX,
  MIN_BRUSH_DIAMETER_IMAGE_PX,
  nudgeBrushSize
} from './constants'

describe('nudgeBrushSize', () => {
  it('increases and decreases size', () => {
    const up = nudgeBrushSize(40, 1)
    const down = nudgeBrushSize(40, -1)
    expect(up).toBeGreaterThan(40)
    expect(down).toBeLessThan(40)
  })

  it('clamps at min and max', () => {
    expect(nudgeBrushSize(MIN_BRUSH_DIAMETER_IMAGE_PX, -1)).toBe(MIN_BRUSH_DIAMETER_IMAGE_PX)
    expect(nudgeBrushSize(MAX_BRUSH_DIAMETER_IMAGE_PX, 1)).toBe(MAX_BRUSH_DIAMETER_IMAGE_PX)
  })
})
