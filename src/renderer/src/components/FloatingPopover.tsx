import type { Component, JSX } from 'solid-js'
import { Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import {
  bindFloatingPosition,
  createVirtualReference,
  type FloatingPositionOptions
} from '../lib/floating-position'

const FloatingPopover: Component<{
  open: () => boolean
  onClose: () => void
  reference?: () => HTMLElement | undefined
  anchor?: () => { x: number; y: number } | undefined
  placement?: FloatingPositionOptions['placement']
  panelClass?: string
  children: JSX.Element
}> = (props) => {
  const [floatingEl, setFloatingEl] = createSignal<HTMLDivElement | undefined>()

  createEffect(() => {
    if (!props.open()) return

    const floating = floatingEl()
    const anchor = props.anchor?.()
    const reference = props.reference?.()
    const positionReference =
      anchor !== undefined ? createVirtualReference(anchor.x, anchor.y) : reference
    if (!positionReference || !floating) return

    const cleanupPosition = bindFloatingPosition(positionReference, floating, {
      placement: props.placement ?? 'bottom-start',
      offset: 4
    })

    const isInsidePopover = (target: Node): boolean => {
      const currentFloating = floatingEl()
      const currentReference = props.reference?.()
      return (
        (currentFloating?.contains(target) ?? false) ||
        (currentReference?.contains(target) ?? false)
      )
    }

    const handleClick = (event: MouseEvent): void => {
      if (isInsidePopover(event.target as Node)) return
      props.onClose()
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') props.onClose()
    }

    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)

    onCleanup(() => {
      cleanupPosition()
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    })
  })

  return (
    <Show when={props.open()}>
      <Portal>
        <div
          ref={setFloatingEl}
          class={`z-50 min-w-[180px] rounded-lg border border-base-content/10 bg-base-100 shadow-lg ${props.panelClass ?? 'p-1'}`}
          role="menu"
          onMouseDown={(event) => event.stopPropagation()}
        >
          {props.children}
        </div>
      </Portal>
    </Show>
  )
}

export default FloatingPopover
