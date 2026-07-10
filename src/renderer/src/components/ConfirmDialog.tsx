import type { Component, JSX } from 'solid-js'
import { Show } from 'solid-js'
import { BsExclamationCircleFill } from 'solid-icons/bs'

const ConfirmDialog: Component<{
  open: () => boolean
  title: () => string
  message: () => string | JSX.Element
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}> = (props) => (
  <Show when={props.open()}>
    <div class="confirm-dialog-backdrop" role="presentation" onClick={() => props.onCancel()}>
      <div
        class="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(event) => event.stopPropagation()}
      >
        <div class="confirm-dialog-header">
          <BsExclamationCircleFill class="confirm-dialog-icon" size={22} aria-hidden="true" />
          <h2 id="confirm-dialog-title" class="confirm-dialog-title">
            {props.title()}
          </h2>
        </div>
        <p id="confirm-dialog-message" class="confirm-dialog-message">
          {props.message()}
        </p>
        <div class="confirm-dialog-actions">
          <button type="button" class="confirm-dialog-btn confirm-dialog-btn--cancel" onClick={() => props.onCancel()}>
            Cancel
          </button>
          <button
            type="button"
            class="confirm-dialog-btn confirm-dialog-btn--confirm"
            onClick={() => props.onConfirm()}
          >
            {props.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  </Show>
)

export default ConfirmDialog
