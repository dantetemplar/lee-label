import type { Component, JSX } from 'solid-js'
import { Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import { blurTextEditableOnEscape } from '../lib/shortcut-guards'

const FloatingModal: Component<{
  open: () => boolean
  onClose: () => void
  labelledBy?: string
  describedBy?: string
  panelClass?: string
  children: JSX.Element
}> = (props) => {
  const [rootEl, setRootEl] = createSignal<HTMLDivElement>()
  const [panelEl, setPanelEl] = createSignal<HTMLDivElement>()

  createEffect(() => {
    if (!props.open()) return
    const root = rootEl()
    const panel = panelEl()
    if (!root || !panel) return

    const previouslyFocused = document.activeElement
    if (previouslyFocused instanceof HTMLElement) {
      previouslyFocused.blur()
    }
    panel.focus({ preventScroll: true })

    const stopKey = (event: KeyboardEvent): void => {
      // Children (inputs, etc.) already received the event; block document-level shortcuts.
      event.stopPropagation()
      if (event.key !== 'Escape') return
      if (blurTextEditableOnEscape(event)) return
      event.preventDefault()
      props.onClose()
    }

    const trapFocus = (event: FocusEvent): void => {
      const next = event.target
      if (!(next instanceof Node) || root.contains(next)) return
      // Nested/stacked dialogs: allow focus to move into another modal.
      if (next instanceof Element && next.closest('[role="dialog"][aria-modal="true"]')) return
      event.preventDefault()
      panel.focus({ preventScroll: true })
    }

    root.addEventListener('keydown', stopKey)
    root.addEventListener('keyup', stopKey)
    document.addEventListener('focusin', trapFocus)

    onCleanup(() => {
      root.removeEventListener('keydown', stopKey)
      root.removeEventListener('keyup', stopKey)
      document.removeEventListener('focusin', trapFocus)
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true })
      }
    })
  })

  return (
    <Show when={props.open()}>
      <Portal>
        <div ref={setRootEl} class="app fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            class="absolute inset-0 bg-base-content/20"
            aria-label="Close dialog"
            onClick={() => props.onClose()}
          />
          <div
            ref={setPanelEl}
            class={`relative z-10 w-full rounded-xl border border-base-content/10 bg-base-100 shadow-xl outline-none ${props.panelClass ?? 'max-w-md p-5'}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={props.labelledBy}
            aria-describedby={props.describedBy}
            tabindex="-1"
          >
            {props.children}
          </div>
        </div>
      </Portal>
    </Show>
  )
}

export default FloatingModal
