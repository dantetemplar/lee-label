/** Physical key order for label shortcuts (layout-independent positions). */
export const LABEL_SHORTCUT_CODES = [
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'KeyQ',
  'KeyW',
  'KeyE',
  'KeyR',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyF',
  'KeyZ',
  'KeyX',
  'KeyC',
  'KeyV'
] as const

export type LabelShortcutCode = (typeof LABEL_SHORTCUT_CODES)[number]

export const LABEL_SHORTCUT_GROUP_SIZE = 4

const FALLBACK_LABELS: Record<LabelShortcutCode, string> = {
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  KeyQ: 'q',
  KeyW: 'w',
  KeyE: 'e',
  KeyR: 'r',
  KeyA: 'a',
  KeyS: 's',
  KeyD: 'd',
  KeyF: 'f',
  KeyZ: 'z',
  KeyX: 'x',
  KeyC: 'c',
  KeyV: 'v'
}

const CODE_INDEX = new Map<string, number>(
  LABEL_SHORTCUT_CODES.map((code, index) => [code, index])
)

export function fallbackShortcutLabel(code: string): string {
  return FALLBACK_LABELS[code as LabelShortcutCode] ?? code
}

export function createFallbackLayoutLabels(): Map<string, string> {
  const labels = new Map<string, string>()
  for (const code of LABEL_SHORTCUT_CODES) {
    labels.set(code, FALLBACK_LABELS[code])
  }
  return labels
}

function normalizeLayoutValue(value: string): string {
  if (value.length === 1) return value.toLowerCase()
  return value
}

export async function readKeyboardLayoutLabels(
  codes: readonly string[] = LABEL_SHORTCUT_CODES
): Promise<Map<string, string>> {
  const labels = createFallbackLayoutLabels()
  const keyboard = navigator.keyboard
  if (!keyboard?.getLayoutMap) return labels

  try {
    const map = await keyboard.getLayoutMap()
    for (const code of codes) {
      const value = map.get(code)
      if (value) labels.set(code, normalizeLayoutValue(value))
    }
  } catch {
    // Keep QWERTY fallbacks when the Keyboard Map API is unavailable.
  }

  return labels
}

export function labelIndexFromCode(code: string): number | null {
  return CODE_INDEX.get(code) ?? null
}

export function shortcutCodeForLabelIndex(index: number): LabelShortcutCode | null {
  return LABEL_SHORTCUT_CODES[index] ?? null
}

export function isLabelGroupEnd(index: number, total: number): boolean {
  if (index < 0 || index >= total - 1) return false
  return (index + 1) % LABEL_SHORTCUT_GROUP_SIZE === 0
}
