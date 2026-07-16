import { describe, expect, it } from 'vitest'
import {
  LABEL_SHORTCUT_CODES,
  isLabelGroupEnd,
  labelIndexFromCode,
  shortcutCodeForLabelIndex
} from './label-shortcuts'

describe('label-shortcuts', () => {
  it('maps 12345 / 67890 groups', () => {
    expect(labelIndexFromCode('Digit1')).toBe(0)
    expect(labelIndexFromCode('Digit5')).toBe(4)
    expect(labelIndexFromCode('Digit6')).toBe(5)
    expect(labelIndexFromCode('Digit0')).toBe(9)
    expect(LABEL_SHORTCUT_CODES).toHaveLength(10)
  })

  it('skips letter keys previously used for labels', () => {
    expect(labelIndexFromCode('KeyQ')).toBeNull()
    expect(labelIndexFromCode('KeyA')).toBeNull()
    expect(labelIndexFromCode('KeyZ')).toBeNull()
  })

  it('round-trips index to code', () => {
    expect(shortcutCodeForLabelIndex(0)).toBe('Digit1')
    expect(shortcutCodeForLabelIndex(4)).toBe('Digit5')
    expect(shortcutCodeForLabelIndex(5)).toBe('Digit6')
    expect(shortcutCodeForLabelIndex(9)).toBe('Digit0')
    expect(shortcutCodeForLabelIndex(99)).toBeNull()
  })

  it('marks visual group boundaries every 5 labels', () => {
    expect(isLabelGroupEnd(4, 10)).toBe(true)
    expect(isLabelGroupEnd(9, 10)).toBe(false)
    expect(isLabelGroupEnd(2, 10)).toBe(false)
    expect(isLabelGroupEnd(4, 5)).toBe(false)
  })
})
