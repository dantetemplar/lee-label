import type { Component, JSX } from 'solid-js'
import type { Placement } from '@floating-ui/dom'
import AppPopover from './AppPopover'

/** Anchored popover shell (Corvu Popover + Floating UI positioning). */
const FloatingPopover: Component<{
  open: () => boolean
  onClose: () => void
  reference?: () => HTMLElement | undefined
  anchor?: () => { x: number; y: number } | undefined
  placement?: Placement
  panelClass?: string
  fitContent?: boolean
  contentRole?: 'menu' | 'dialog' | 'listbox'
  children: JSX.Element
}> = (props) => (
  <AppPopover
    open={props.open}
    onClose={props.onClose}
    reference={props.reference}
    anchor={props.anchor}
    placement={props.placement}
    panelClass={props.panelClass}
    fitContent={props.fitContent}
    contentRole={props.contentRole}
  >
    {props.children}
  </AppPopover>
)

export default FloatingPopover
