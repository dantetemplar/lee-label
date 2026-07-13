import Dialog from '@corvu/dialog'
import type { Component, JSX } from 'solid-js'
import { Show, createEffect } from 'solid-js'
import { clearStickyHover } from '../lib/clear-sticky-hover'

const log = (...args: unknown[]): void => {
  console.debug('[AppDialog]', ...args)
}

const AppDialog: Component<{
  open: () => boolean
  onClose: () => void
  /** Optional primary action on Enter (when focus is not on a button/input). */
  onSubmit?: () => void
  labelledBy?: string
  describedBy?: string
  panelClass?: string
  role?: 'dialog' | 'alertdialog'
  /** Focus this element when the dialog opens (e.g. confirm OK). */
  initialFocusEl?: () => HTMLElement | undefined
  /**
   * Nested Corvu dialogs must be under this dialog's Content so solid-dismissible
   * treats them as a layer stack (sibling dismissibles close the parent on focus).
   */
  nested?: JSX.Element
  children: JSX.Element
}> = (props) => {
  let panelEl: HTMLDivElement | undefined

  createEffect(() => {
    log('open=', props.open(), 'hasSubmit=', Boolean(props.onSubmit), 'role=', props.role ?? 'dialog')
  })

  const handleOpenChange = (open: boolean): void => {
    log('onOpenChange', open)
    if (open) return
    log('→ onClose()')
    props.onClose()
    clearStickyHover()
  }

  const handleContentKeyDown = (event: KeyboardEvent): void => {
    log('content keydown', {
      key: event.key,
      code: event.code,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      target: event.target instanceof Element ? event.target.tagName : typeof event.target,
      active:
        document.activeElement instanceof HTMLElement
          ? `${document.activeElement.tagName}.${document.activeElement.className.split(' ')[0] ?? ''}`
          : null
    })

    // Nested dialogs portal to body; stop keys from reaching parent dialog handlers.
    event.stopPropagation()

    if (event.key !== 'Enter' || !props.onSubmit) return
    if (event.ctrlKey || event.metaKey || event.altKey) {
      log('Enter ignored (modifier)')
      return
    }
    if (
      event.target instanceof Element &&
      event.target.closest('button, a, [role="button"], input, textarea, select')
    ) {
      log('Enter ignored (native control)')
      return
    }

    event.preventDefault()
    log('→ onSubmit()')
    props.onSubmit()
  }

  return (
    <Dialog
      open={props.open()}
      onOpenChange={handleOpenChange}
      role={props.role ?? 'dialog'}
      initialFocusEl={props.initialFocusEl?.()}
      onInitialFocus={(event) => {
        if (props.initialFocusEl?.()) return
        event.preventDefault()
        panelEl?.focus({ preventScroll: true })
      }}
      restoreFocus
      trapFocus
      modal
      closeOnOutsideFocus={false}
      closeOnOutsidePointerStrategy="pointerdown"
      onOutsidePointer={(event) => {
        log('onOutsidePointer', event.type, event.target instanceof Element ? event.target.tagName : null)
      }}
      onEscapeKeyDown={(event) => {
        log('onEscapeKeyDown', event.key)
      }}
    >
      <Show when={props.open()}>
        <Dialog.Portal>
          <Dialog.Overlay class="app fixed inset-0 z-50 bg-base-content/20" />
          <div class="app pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <Dialog.Content
              ref={panelEl}
              tabIndex={-1}
              class={`pointer-events-auto relative z-10 w-full rounded-xl border border-base-content/10 bg-base-100 shadow-xl outline-none ${props.panelClass ?? 'max-w-md p-5'}`}
              aria-labelledby={props.labelledBy}
              aria-describedby={props.describedBy}
              onKeyDown={handleContentKeyDown}
            >
              {props.children}
              {props.nested}
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      </Show>
    </Dialog>
  )
}

export default AppDialog
