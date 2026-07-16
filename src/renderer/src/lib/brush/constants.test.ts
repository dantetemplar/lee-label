import { describe, expect, it } from 'vitest'
import {
  MAX_BRUSH_DIAMETER_IMAGE_PX,
  MIN_BRUSH_DIAMETER_IMAGE_PX,
  nudgeBrushSize
} from './constants'

describe('nudgeBrushSize', () => {
  it('changes size by 1px', () => {
    expect(nudgeBrushSize(40, 1)).toBe(41)
    expect(nudgeBrushSize(40, -1)).toBe(39)
  })

  it('clamps at min and max', () => {
    expect(nudgeBrushSize(MIN_BRUSH_DIAMETER_IMAGE_PX, -1)).toBe(MIN_BRUSH_DIAMETER_IMAGE_PX)
    expect(nudgeBrushSize(MAX_BRUSH_DIAMETER_IMAGE_PX, 1)).toBe(MAX_BRUSH_DIAMETER_IMAGE_PX)
  })
})
