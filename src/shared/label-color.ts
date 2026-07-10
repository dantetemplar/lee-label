import { hashLabelName } from './blake2s'
import { PREDEFINED_COLORS, type Rgb } from './predefined-colors'

export type { Rgb }

export function makeFileName(value: string): string {
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

export function normalizeLabel(label: string): string {
  return makeFileName(label).replace(/-/g, '_')
}

export function rgbToHex(color: Rgb): string {
  return `#${color.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

export function hexToRgb(color: string): Rgb {
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

export function getColorFromIndex(index: number): Rgb {
  const color: Rgb = [0, 0, 0]
  let value = index >>> 0

  for (let j = 7; j >= 0; j--) {
    for (let channel = 0; channel < 3; channel++) {
      color[channel] |= ((value >> channel) & 1) << j
    }
    value >>>= 3
  }

  return color
}

function rgbKey(color: Rgb): string {
  return `${color[0]},${color[1]},${color[2]}`
}

function tintShadeColors(color: Rgb): Rgb[] {
  const variants: Rgb[] = []
  for (const target of [255, 0] as const) {
    for (let factor = 1; factor < 10; factor++) {
      variants.push(
        color.map((channel) =>
          Math.trunc(channel + ((target - channel) * factor) / 10)
        ) as Rgb
      )
    }
  }
  return variants
}

function getUnusedColor(usedColors: Set<string>): Rgb {
  const used = [...usedColors].map((key) => key.split(',').map(Number) as Rgb)
  if (used.length === 0) return [128, 128, 128]

  const channels: Rgb = [0, 0, 0]
  for (let channel = 0; channel < 3; channel++) {
    const sorted = [...used].sort((left, right) => left[channel] - right[channel])
    let bestGap = -1
    let midpoint = 128
    for (let index = 0; index < sorted.length - 1; index++) {
      const gap = sorted[index + 1][channel] - sorted[index][channel]
      if (gap > bestGap) {
        bestGap = gap
        midpoint = Math.trunc((sorted[index][channel] + sorted[index + 1][channel]) / 2)
      }
    }
    channels[channel] = midpoint
  }
  return channels
}

function generateColor(color: Rgb, usedColors: Set<string>): Rgb {
  for (const candidate of tintShadeColors(color)) {
    if (!usedColors.has(rgbKey(candidate))) return candidate
  }
  return getUnusedColor(usedColors)
}

export function getLabelColor(labelName: string, existingColorsHex: string[]): string {
  const normalizedName = normalizeLabel(labelName)
  const nameHash = hashLabelName(normalizedName)
  return getLabelColorWithHash(labelName, existingColorsHex, nameHash)
}

export function getLabelColorWithHash(
  labelName: string,
  existingColorsHex: string[],
  nameHash: number
): string {
  const existingColors = existingColorsHex.filter(Boolean).map(hexToRgb)
  const existingColorKeys = new Set(existingColors.map(rgbKey))
  const usedColors = new Set([
    ...Object.values(PREDEFINED_COLORS).map(rgbKey),
    ...existingColorKeys
  ])

  const normalizedName = normalizeLabel(labelName)
  let color = PREDEFINED_COLORS[normalizedName]

  if (!color) {
    color = getColorFromIndex(nameHash)
  }

  if (existingColorKeys.has(rgbKey(color))) {
    color = generateColor(color, usedColors)
  }

  return rgbToHex(color)
}
