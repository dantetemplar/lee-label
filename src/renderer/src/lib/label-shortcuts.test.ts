import { describe, expect, it } from 'vitest'
import {
  LABEL_SHORTCUT_CODES,
  isLabelGroupEnd,
  labelIndexFromCode,
  shortcutCodeForLabelIndex
} from './label-shortcuts'

describe('label-shortcuts', () => {
  it('maps 1234 / qwer / asdf / zxcv groups', () => {
    expect(labelIndexFromCode('Digit1')).toBe(0)
    expect(labelIndexFromCode('Digit4')).toBe(3)
    expect(labelIndexFromCode('KeyQ')).toBe(4)
    expect(labelIndexFromCode('KeyR')).toBe(7)
    expect(labelIndexFromCode('KeyA')).toBe(8)
    expect(labelIndexFromCode('KeyF')).toBe(11)
    expect(labelIndexFromCode('KeyZ')).toBe(12)
    expect(labelIndexFromCode('KeyV')).toBe(15)
    expect(LABEL_SHORTCUT_CODES).toHaveLength(16)
  })

  it('skips the rest of each keyboard row', () => {
    expect(labelIndexFromCode('KeyT')).toBeNull()
    expect(labelIndexFromCode('KeyG')).toBeNull()
    expect(labelIndexFromCode('KeyB')).toBeNull()
    expect(labelIndexFromCode('Digit5')).toBeNull()
  })

  it('round-trips index to code', () => {
    expect(shortcutCodeForLabelIndex(0)).toBe('Digit1')
    expect(shortcutCodeForLabelIndex(4)).toBe('KeyQ')
    expect(shortcutCodeForLabelIndex(8)).toBe('KeyA')
    expect(shortcutCodeForLabelIndex(12)).toBe('KeyZ')
    expect(shortcutCodeForLabelIndex(99)).toBeNull()
  })

  it('marks visual group boundaries every 4 labels', () => {
    expect(isLabelGroupEnd(3, 10)).toBe(true)
    expect(isLabelGroupEnd(7, 10)).toBe(true)
    expect(isLabelGroupEnd(2, 10)).toBe(false)
    expect(isLabelGroupEnd(9, 10)).toBe(false)
  })
})
