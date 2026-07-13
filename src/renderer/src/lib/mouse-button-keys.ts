export type MouseButton = 'left' | 'right' | 'middle'

export type MouseHint = MouseButton | 'scroll'

export const MOUSE_BUTTON_KEYS = {
  left: 'mouse:left',
  right: 'mouse:right',
  middle: 'mouse:middle',
  scroll: 'mouse:scroll'
} as const

export function parseMouseHintKey(key: string): MouseHint | null {
  if (key === MOUSE_BUTTON_KEYS.left) return 'left'
  if (key === MOUSE_BUTTON_KEYS.right) return 'right'
  if (key === MOUSE_BUTTON_KEYS.middle) return 'middle'
  if (key === MOUSE_BUTTON_KEYS.scroll) return 'scroll'
  return null
}
