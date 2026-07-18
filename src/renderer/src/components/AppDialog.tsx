import Dialog from '@corvu/dialog'
import type { Component, JSX } from 'solid-js'
import { Show, createContext, useContext } from 'solid-js'
import { clearStickyHover } from '../lib/clear-sticky-hover'

const ParentDialogPanelContext = createContext<(() => HTMLElement | undefined) | undefined>()

const AppDialog: Component<{
  open: () => boolean
  onClose: () => void
  /** Optional primary action on Enter (when focus is not on a button/input). */
  onSubmit?: () => void
  labelledBy?: string
  describedBy?: string
  panelClass?: string
  role?: 'dialog' | 'alertdialog'
  /** Focus this element when the dialog opens (e.g. confirm OK). Defaults to the panel. */
  initialFocusEl?: () => HTMLElement | undefined
  /**
   * Nested Corvu dialogs must be under this dialog's Content so solid-dismissible
   * treats them as a layer stack (sibling dismissibles close the parent on focus).
   */
  nested?: JSX.Element
  children: JSX.Element
}> = (props) => {
  let panelEl: HTMLDivElement | undefined
  const getParentPanel = useContext(ParentDialogPanelContext)

  const handleOpenChange = (open: boolean): void => {
    if (open) return
    props.onClose()
    clearStickyHover()
  }

  const handleContentKeyDown = (event: KeyboardEvent): void => {
    // Nested dialogs portal to body; stop keys from reaching parent dialog handlers.
    event.stopPropagation()

    if (event.key !== 'Enter' || !props.onSubmit) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (
      event.target instanceof Element &&
      event.target.closest('button, a, [role="button"], input, textarea, select')
    ) {
      return
    }

    event.preventDefault()
    props.onSubmit()
  }

  const getPanel = (): HTMLDivElement | undefined => panelEl

  return (
    <ParentDialogPanelContext.Provider value={getPanel}>
      <Dialog
        open={props.open()}
        onOpenChange={handleOpenChange}
        role={props.role ?? 'dialog'}
        restoreFocus
        trapFocus
        modal
        closeOnOutsideFocus={false}
        closeOnOutsidePointerStrategy="pointerdown"
        onInitialFocus={(event) => {
          event.preventDefault()
          const target = props.initialFocusEl?.() ?? panelEl
          target?.focus({ preventScroll: true })
        }}
        onFinalFocus={(event) => {
          const parentPanel = getParentPanel?.()
          if (!parentPanel) return
          event.preventDefault()
          queueMicrotask(() => parentPanel.focus({ preventScroll: true }))
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
    </ParentDialogPanelContext.Provider>
  )
}

export default AppDialog
