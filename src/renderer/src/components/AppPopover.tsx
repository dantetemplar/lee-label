import Popover from '@corvu/popover'
import type { Placement } from '@floating-ui/dom'
import type { Component, JSX } from 'solid-js'
import { Show, createEffect, createSignal } from 'solid-js'
import { clearStickyHover } from '../lib/clear-sticky-hover'

const log = (...args: unknown[]): void => {
  console.debug('[AppPopover]', ...args)
}

const AppPopover: Component<{
  open: () => boolean
  onClose: () => void
  reference?: () => HTMLElement | undefined
  anchor?: () => { x: number; y: number } | undefined
  placement?: Placement
  panelClass?: string
  fitContent?: boolean
  contentRole?: 'menu' | 'dialog' | 'listbox'
  children: JSX.Element
}> = (props) => {
  const [anchorStyle, setAnchorStyle] = createSignal<{
    left: string
    top: string
    width: string
    height: string
  }>({
    left: '0px',
    top: '0px',
    width: '0px',
    height: '0px'
  })

  const syncAnchor = (): void => {
    const point = props.anchor?.()
    if (point) {
      setAnchorStyle({
        left: `${Math.round(point.x)}px`,
        top: `${Math.round(point.y)}px`,
        width: '0px',
        height: '0px'
      })
      return
    }

    const reference = props.reference?.()
    if (!reference) return
    const rect = reference.getBoundingClientRect()
    setAnchorStyle({
      left: `${Math.round(rect.left)}px`,
      top: `${Math.round(rect.top)}px`,
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`
    })
  }

  createEffect(() => {
    if (!props.open()) return
    syncAnchor()
    const reference = props.reference?.()
    if (!reference || props.anchor?.()) return

    const observer = new ResizeObserver(syncAnchor)
    observer.observe(reference)
    window.addEventListener('scroll', syncAnchor, true)
    window.addEventListener('resize', syncAnchor)

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', syncAnchor, true)
      window.removeEventListener('resize', syncAnchor)
    }
  })

  createEffect(() => {
    props.anchor?.()
    if (props.open()) syncAnchor()
  })

  const handleOpenChange = (open: boolean): void => {
    log('onOpenChange', open)
    if (open) return
    log('→ onClose()')
    props.onClose()
    clearStickyHover()
  }

  const isReferenceTarget = (target: EventTarget | null): boolean => {
    const reference = props.reference?.()
    if (!reference || !(target instanceof Node)) return false
    return reference === target || reference.contains(target)
  }

  return (
    <Popover
      open={props.open()}
      onOpenChange={handleOpenChange}
      placement={props.placement ?? 'bottom-start'}
      strategy="fixed"
      floatingOptions={{ offset: 4, flip: true, shift: { padding: 8 } }}
      modal={false}
      trapFocus={false}
      restoreFocus={false}
      onOutsidePointer={(event) => {
        if (isReferenceTarget(event.target)) {
          log('onOutsidePointer ignored (reference)')
          event.preventDefault()
        }
      }}
    >
      <Show when={props.open()}>
        <Popover.Anchor class="pointer-events-none fixed" style={anchorStyle()} />
      </Show>
      <Show when={props.open()}>
        <Popover.Portal>
          <Popover.Content
            class={`app z-50 rounded-lg border border-base-content/10 bg-base-100 shadow-lg ${props.fitContent !== false ? 'w-fit' : ''} ${props.panelClass ?? 'p-1'}`}
            role={props.contentRole ?? 'menu'}
          >
            {props.children}
          </Popover.Content>
        </Popover.Portal>
      </Show>
    </Popover>
  )
}

export default AppPopover
