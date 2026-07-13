import type { Component, JSX } from 'solid-js'
import { Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import { blurTextEditableOnEscape, getTextEditableElement } from '../lib/shortcut-guards'

function isTopmostDialog(panel: HTMLElement): boolean {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
  return dialogs.length > 0 && dialogs[dialogs.length - 1] === panel
}

function isNativeEnterTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      'button, a, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]'
    )
  )
}

const FloatingModal: Component<{
  open: () => boolean
  onClose: () => void
  /** Called on Enter when focus is not on a control that handles it natively. */
  onSubmit?: () => void
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

    const shouldSubmitOnEnter = (event: KeyboardEvent): boolean => {
      if (!props.onSubmit || event.defaultPrevented || event.isComposing) return false
      if (isNativeEnterTarget(event.target) || isNativeEnterTarget(document.activeElement)) {
        return false
      }
      if (getTextEditableElement(document.activeElement)) return false
      if (getTextEditableElement(event.target)) return false
      return true
    }

    const handleEnterEscape = (event: KeyboardEvent): boolean => {
      if (!isTopmostDialog(panel)) return false

      if (event.key === 'Enter' && shouldSubmitOnEnter(event)) {
        event.preventDefault()
        event.stopPropagation()
        props.onSubmit?.()
        return true
      }

      if (event.key !== 'Escape') return false
      if (blurTextEditableOnEscape(event)) {
        panel.focus({ preventScroll: true })
        event.stopPropagation()
        return true
      }
      event.preventDefault()
      event.stopPropagation()
      props.onClose()
      return true
    }

    const onRootKeyDown = (event: KeyboardEvent): void => {
      if (handleEnterEscape(event)) return
      // Keep app/document shortcuts from seeing other keys while the dialog is open.
      event.stopPropagation()
    }

    const onRootKeyUp = (event: KeyboardEvent): void => {
      event.stopPropagation()
    }

    // Capture fallback only when focus left the dialog (root listener won't see the event).
    // Do not handle Enter here while focus is inside — field handlers must run first.
    const onDocKeyDownCapture = (event: KeyboardEvent): void => {
      const active = document.activeElement
      if (active instanceof Node && root.contains(active)) return
      handleEnterEscape(event)
    }

    const trapFocus = (event: FocusEvent): void => {
      const next = event.target
      if (!(next instanceof Node) || root.contains(next)) return
      if (next instanceof Element && next.closest('[role="dialog"][aria-modal="true"]')) return
      event.preventDefault()
      panel.focus({ preventScroll: true })
    }

    root.addEventListener('keydown', onRootKeyDown)
    root.addEventListener('keyup', onRootKeyUp)
    document.addEventListener('keydown', onDocKeyDownCapture, true)
    document.addEventListener('focusin', trapFocus)

    onCleanup(() => {
      root.removeEventListener('keydown', onRootKeyDown)
      root.removeEventListener('keyup', onRootKeyUp)
      document.removeEventListener('keydown', onDocKeyDownCapture, true)
      document.removeEventListener('focusin', trapFocus)
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true })
        // Mouse still over the opener (overlay ate mouseleave) — don't leave focus paint.
        if (previouslyFocused.matches(':hover')) {
          previouslyFocused.blur()
        }
      }
      // Clear sticky :hover after the overlay is removed without a pointer move.
      const body = document.body
      body.style.pointerEvents = 'none'
      requestAnimationFrame(() => {
        body.style.pointerEvents = ''
      })
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
