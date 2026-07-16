import { describe, expect, it } from 'vitest'
import { editToolForShapeType, shouldPreserveBrushSession } from './tool-borrow'

describe('shouldPreserveBrushSession', () => {
  it('preserves only mask ↔ magic-stick', () => {
    expect(shouldPreserveBrushSession('mask', 'magic-stick')).toBe(true)
    expect(shouldPreserveBrushSession('magic-stick', 'mask')).toBe(true)
    expect(shouldPreserveBrushSession('mask', 'mask')).toBe(false)
    expect(shouldPreserveBrushSession('mask', 'cursor')).toBe(false)
    expect(shouldPreserveBrushSession('cursor', 'mask')).toBe(false)
    expect(shouldPreserveBrushSession(undefined, 'mask')).toBe(false)
  })
})

describe('editToolForShapeType', () => {
  it('maps shape types to edit tools', () => {
    expect(editToolForShapeType('rectangle')).toBe('rectangle')
    expect(editToolForShapeType('mask')).toBe('mask')
    expect(editToolForShapeType('polygon')).toBe('mask')
  })
})
