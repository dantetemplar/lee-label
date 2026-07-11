import type { Component, JSX } from 'solid-js'
import { Show, createEffect, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'

const FloatingModal: Component<{
  open: () => boolean
  onClose: () => void
  labelledBy?: string
  describedBy?: string
  panelClass?: string
  children: JSX.Element
}> = (props) => {
  createEffect(() => {
    if (!props.open()) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      props.onClose()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown, true))
  })

  return (
    <Show when={props.open()}>
      <Portal>
        <div class="app fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            class="absolute inset-0 bg-base-content/20"
            aria-label="Close dialog"
            onClick={() => props.onClose()}
          />
          <div
            class={`relative z-10 w-full rounded-xl border border-base-content/10 bg-base-100 shadow-xl ${props.panelClass ?? 'max-w-md p-5'}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={props.labelledBy}
            aria-describedby={props.describedBy}
          >
            {props.children}
          </div>
        </div>
      </Portal>
    </Show>
  )
}

export default FloatingModal
