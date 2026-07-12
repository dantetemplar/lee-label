import { createSignal, onCleanup, onMount } from 'solid-js'
import {
  LABEL_SHORTCUT_CODES,
  createFallbackLayoutLabels,
  readKeyboardLayoutLabels
} from './label-shortcuts'

/** Reactive map of physical key code → character for the active keyboard layout. */
export function createKeyboardLayoutLabels() {
  const [labels, setLabels] = createSignal(createFallbackLayoutLabels())

  onMount(() => {
    let cancelled = false

    const refresh = (): void => {
      void readKeyboardLayoutLabels(LABEL_SHORTCUT_CODES).then((next) => {
        if (!cancelled) setLabels(next)
      })
    }

    refresh()

    // Electron's navigator.keyboard may expose getLayoutMap without EventTarget.
    const keyboard = navigator.keyboard
    const addListener = keyboard?.addEventListener?.bind(keyboard)
    const removeListener = keyboard?.removeEventListener?.bind(keyboard)

    if (addListener) {
      addListener('layoutchange', refresh)
    }

    onCleanup(() => {
      cancelled = true
      removeListener?.('layoutchange', refresh)
    })
  })

  return labels
}
