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
  fitContent?: boolean
  children: JSX.Element
}> = (props) => {
  const [floatingEl, setFloatingEl] = createSignal<HTMLDivElement | undefined>()

  createEffect(() => {
    const isOpen = props.open()
    const floating = floatingEl()
    const reference = props.reference ? props.reference() : undefined
    const anchor = props.anchor ? props.anchor() : undefined

    if (!isOpen || !floating) return

    const positionReference =
      anchor !== undefined ? createVirtualReference(anchor.x, anchor.y) : reference
    if (!positionReference) return

    const rect = positionReference.getBoundingClientRect()
    floating.style.position = 'fixed'
    floating.style.left = `${Math.round(rect.left)}px`
    floating.style.top = `${Math.round(rect.bottom + 4)}px`

    const cleanupPosition = bindFloatingPosition(positionReference, floating, {
      placement: props.placement ?? 'bottom-start',
      offset: 4
    })

    const isInside = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false
      if (floating.contains(target)) return true
      const currentReference = props.reference ? props.reference() : undefined
      return currentReference?.contains(target) ?? false
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (event.button > 0) return
      if (isInside(event.target)) return
      props.onClose()
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      props.onClose()
    }

    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown, true)
    }, 0)
    document.addEventListener('keydown', handleKeyDown, true)

    onCleanup(() => {
      window.clearTimeout(timer)
      cleanupPosition()
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    })
  })

  return (
    <Show when={props.open()}>
      <Portal>
        <div
          ref={setFloatingEl}
          class={`app z-50 rounded-lg border border-base-content/10 bg-base-100 shadow-lg ${props.fitContent ? 'w-fit' : 'min-w-[180px]'} ${props.panelClass ?? 'p-1'}`}
          role="menu"
        >
          {props.children}
        </div>
      </Portal>
    </Show>
  )
}

export default FloatingPopover
