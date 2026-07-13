import { describe, expect, it } from 'vitest'
import { getToolControlHints } from './tool-control-hints'

describe('getToolControlHints', () => {
  it('returns empty hints for non-image views', () => {
    expect(getToolControlHints('cursor', 'instance', false)).toEqual([])
  })

  it('includes selection hints for cursor in instance mode', () => {
    const hints = getToolControlHints('cursor', 'instance', true)
    expect(hints.some((hint) => hint.label === 'Select')).toBe(true)
    expect(hints.some((hint) => hint.label === 'Cycle')).toBe(true)
  })

  it('includes commit hint for mask in instance mode', () => {
    const hints = getToolControlHints('mask', 'instance', true)
    expect(hints.some((hint) => hint.label === 'Commit' && hint.keys.includes('Space'))).toBe(true)
  })

  it('includes alt-select hint for rectangle and mask in instance mode', () => {
    const rectangleHints = getToolControlHints('rectangle', 'instance', true)
    const maskHints = getToolControlHints('mask', 'instance', true)

    expect(
      rectangleHints.some(
        (hint) => hint.label === 'Select' && hint.keys.join('+') === 'Alt+mouse:left'
      )
    ).toBe(true)
    expect(
      maskHints.some(
        (hint) => hint.label === 'Select' && hint.keys.join('+') === 'Alt+mouse:left'
      )
    ).toBe(true)
  })

  it('omits rectangle hints in semantic mode', () => {
    const hints = getToolControlHints('rectangle', 'semantic', true)
    expect(hints.some((hint) => hint.label === 'Draw')).toBe(false)
  })

  it('includes dataset workflow shortcuts on images', () => {
    const hints = getToolControlHints('cursor', 'semantic', true)
    expect(hints.some((hint) => hint.label === 'Mark done' && hint.keys.join('+') === 'Ctrl+Enter')).toBe(
      true
    )
    expect(
      hints.some((hint) => hint.label === 'Skip' && hint.keys.join('+') === 'Ctrl+Shift+Enter')
    ).toBe(true)
  })
})
