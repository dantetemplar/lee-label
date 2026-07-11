import { LABEL_COLORS } from './annotations'
import { hashLabelName } from './blake2s'

export type Rgb = [number, number, number]

const GOLDEN_RATIO = 0.618033988749895

export function normalizeHexColor(hex: string): string {
  const trimmed = hex.trim().toLowerCase()
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  if (withHash.length === 4) {
    const [, r, g, b] = withHash
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return withHash
}

export function hexColorsEqual(a: string, b: string): boolean {
  return normalizeHexColor(a) === normalizeHexColor(b)
}

export function isLabelPaletteColor(color: string): boolean {
  const normalized = normalizeHexColor(color)
  return LABEL_COLORS.some((paletteColor) => normalizeHexColor(paletteColor) === normalized)
}

export function isValidHexColor(color: string): boolean {
  const trimmed = color.trim()
  return /^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/.test(trimmed)
}

/** Preview only when a full 6-digit hex is typed. */
export function parseCompleteHexColor(color: string): string | null {
  const match = color.trim().match(/^#?([0-9a-fA-F]{6})$/)
  if (!match) return null
  return `#${match[1].toLowerCase()}`
}

function makeFileName(value: string): string {
  let ascii = ''
  for (const char of value.normalize('NFKD')) {
    if (char.charCodeAt(0) <= 127) ascii += char
  }
  return ascii
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '-')
}

function normalizeLabel(label: string): string {
  return makeFileName(label).replace(/-/g, '_')
}

function rgbToHex(color: Rgb): string {
  return `#${color.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function hexToRgb(color: string): Rgb {
  const normalized = color.replace('#', '')
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized
  const int = Number.parseInt(value, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function hexToRgbNormalized(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  return [r / 255, g / 255, b / 255]
}

/** Neon HSV→RGB: full saturation, high value, good for translucent mask overlays. */
function brightColorFromHash(hash: number, attempt = 0): Rgb {
  const hue = ((hash / 0xffffff + attempt * GOLDEN_RATIO) % 1 + 1) % 1
  return hsvToRgb(hue, 1, 1)
}

function hsvToRgb(h: number, s: number, v: number): Rgb {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)

  let r = 0
  let g = 0
  let b = 0
  switch (i % 6) {
    case 0:
      r = v
      g = t
      b = p
      break
    case 1:
      r = q
      g = v
      b = p
      break
    case 2:
      r = p
      g = v
      b = t
      break
    case 3:
      r = p
      g = q
      b = v
      break
    case 4:
      r = t
      g = p
      b = v
      break
    case 5:
      r = v
      g = p
      b = q
      break
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

/**
 * Pick a neon palette color by name hash; if all 30 are taken, golden-ratio HSV.
 */
export function getLabelColor(labelName: string, existingColorsHex: string[]): string {
  const usedHex = new Set(existingColorsHex.filter(Boolean).map(normalizeHexColor))
  const nameHash = hashLabelName(normalizeLabel(labelName))

  for (let offset = 0; offset < LABEL_COLORS.length; offset++) {
    const color = normalizeHexColor(LABEL_COLORS[(nameHash + offset) % LABEL_COLORS.length])
    if (!usedHex.has(color)) return color
  }

  for (let attempt = 0; attempt < 256; attempt++) {
    const color = normalizeHexColor(rgbToHex(brightColorFromHash(nameHash, attempt)))
    if (!usedHex.has(color)) return color
  }

  return normalizeHexColor(rgbToHex(brightColorFromHash(nameHash, usedHex.size)))
}
