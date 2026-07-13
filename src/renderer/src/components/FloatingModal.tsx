import type { Component, JSX } from 'solid-js'
import AppDialog from './AppDialog'

/** Centered modal shell (Corvu Dialog + daisyUI chrome). */
const FloatingModal: Component<{
  open: () => boolean
  onClose: () => void
  onSubmit?: () => void
  labelledBy?: string
  describedBy?: string
  panelClass?: string
  role?: 'dialog' | 'alertdialog'
  initialFocusEl?: () => HTMLElement | undefined
  nested?: JSX.Element
  children: JSX.Element
}> = (props) => (
  <AppDialog
    open={props.open}
    onClose={props.onClose}
    onSubmit={props.onSubmit}
    labelledBy={props.labelledBy}
    describedBy={props.describedBy}
    panelClass={props.panelClass}
    role={props.role}
    initialFocusEl={props.initialFocusEl}
    nested={props.nested}
  >
    {props.children}
  </AppDialog>
)

export default FloatingModal
