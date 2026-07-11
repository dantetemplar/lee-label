import { describe, expect, it } from 'vitest'
import { LABEL_COLORS } from './annotations'
import {
  getLabelColor,
  hexColorsEqual,
  isLabelPaletteColor,
  isValidHexColor,
  normalizeHexColor,
  parseCompleteHexColor
} from './label-color'

function isNeon(hex: string): boolean {
  const n = normalizeHexColor(hex).slice(1)
  const r = Number.parseInt(n.slice(0, 2), 16)
  const g = Number.parseInt(n.slice(2, 4), 16)
  const b = Number.parseInt(n.slice(4, 6), 16)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max >= 230 && max - min >= 100
}

describe('normalizeHexColor', () => {
  it('normalizes casing and missing hash', () => {
    expect(normalizeHexColor('24B353')).toBe('#24b353')
    expect(normalizeHexColor('#FA3253')).toBe('#fa3253')
  })

  it('expands 3-digit hex', () => {
    expect(normalizeHexColor('#f00')).toBe('#ff0000')
  })
})

describe('hexColorsEqual', () => {
  it('matches equivalent hex values', () => {
    expect(hexColorsEqual('#24B353', '#24b353')).toBe(true)
    expect(hexColorsEqual('24b353', '#24b353')).toBe(true)
  })
})

describe('isLabelPaletteColor', () => {
  it('detects palette membership', () => {
    expect(isLabelPaletteColor(LABEL_COLORS[0])).toBe(true)
    expect(isLabelPaletteColor('#abcdef')).toBe(false)
  })
})

describe('isValidHexColor', () => {
  it('accepts 3 and 6 digit hex', () => {
    expect(isValidHexColor('#f00')).toBe(true)
    expect(isValidHexColor('f94d4d')).toBe(true)
    expect(isValidHexColor('#gg0000')).toBe(false)
  })
})

describe('parseCompleteHexColor', () => {
  it('returns normalized hex only for complete 6-digit values', () => {
    expect(parseCompleteHexColor('#F94D4D')).toBe('#f94d4d')
    expect(parseCompleteHexColor('f94d4d')).toBe('#f94d4d')
    expect(parseCompleteHexColor('#f94')).toBe(null)
    expect(parseCompleteHexColor('#f94d4')).toBe(null)
  })
})

describe('getLabelColor', () => {
  it('has a 30-color neon palette', () => {
    expect(LABEL_COLORS).toHaveLength(30)
    for (const color of LABEL_COLORS) {
      expect(isNeon(color)).toBe(true)
    }
  })

  it('picks from the neon palette for new labels', () => {
    const color = getLabelColor('person', [])
    expect(LABEL_COLORS.map((c) => c.toLowerCase())).toContain(color)
  })

  it('returns stable color for the same label name', () => {
    expect(getLabelColor('person', [])).toBe(getLabelColor('person', []))
  })

  it('avoids colors already used by other labels', () => {
    const existing = getLabelColor('tree', [])
    const next = getLabelColor('tree-copy', [existing])
    expect(next.toLowerCase()).not.toBe(existing.toLowerCase())
  })

  it('falls back to golden-ratio neon when the palette is exhausted', () => {
    const used = [...LABEL_COLORS]
    const extra = getLabelColor('overflow-label', used)
    expect(used.map((c) => c.toLowerCase())).not.toContain(extra)
    expect(isNeon(extra)).toBe(true)
  })
})
