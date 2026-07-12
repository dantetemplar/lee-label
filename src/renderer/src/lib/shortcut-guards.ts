const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'radio',
  'submit',
  'reset',
  'file',
  'image',
  'hidden',
  'range',
  'color'
])

/** Nearest text-editable control, if any. */
export function getTextEditableElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null

  const editable = target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
  )
  if (!(editable instanceof HTMLElement)) return null

  if (editable instanceof HTMLInputElement && NON_TEXT_INPUT_TYPES.has(editable.type)) {
    return null
  }

  return editable
}

export function isTextEditableTarget(target: EventTarget | null): boolean {
  return getTextEditableElement(target) !== null
}

/** Targets that should own keyboard input and block app/tool shortcuts. */
export function isShortcutBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false

  if (target.closest('[role="dialog"][aria-modal="true"]')) return true
  if (target.closest('[data-shortcut-block]')) return true

  return isTextEditableTarget(target)
}

/** Blur a focused text field on Escape. Returns true if handled. */
export function blurTextEditableOnEscape(event: KeyboardEvent): boolean {
  if (event.key !== 'Escape' || event.defaultPrevented) return false
  const editable = getTextEditableElement(event.target)
  if (!editable || document.activeElement !== editable) return false
  event.preventDefault()
  editable.blur()
  return true
}
