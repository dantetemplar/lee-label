import type { Component, JSX } from 'solid-js'
import { Show } from 'solid-js'
import { BsExclamationCircleFill } from 'solid-icons/bs'

const ConfirmDialog: Component<{
  open: () => boolean
  title: () => string
  message: () => string | JSX.Element
  confirmLabel?: string
  destructive?: boolean
  onCancel: () => void
  onConfirm: () => void
}> = (props) => (
  <Show when={props.open()}>
    <dialog class="modal modal-open">
      <div class="modal-box max-w-md">
        <div class="flex items-start gap-3">
          <BsExclamationCircleFill class="text-warning mt-0.5 shrink-0" size={22} aria-hidden="true" />
          <div class="min-w-0">
            <h2 id="confirm-dialog-title" class="text-base font-semibold leading-snug">
              {props.title()}
            </h2>
            <p id="confirm-dialog-message" class="text-base-content/70 mt-2 text-sm leading-relaxed">
              {props.message()}
            </p>
          </div>
        </div>
        <div class="modal-action mt-6">
          <button type="button" class="btn btn-ghost" onClick={() => props.onCancel()}>
            Cancel
          </button>
          <button
            type="button"
            class={`btn ${props.destructive ? 'btn-error' : 'btn-primary'}`}
            onClick={() => props.onConfirm()}
          >
            {props.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="button" aria-label="Close dialog" onClick={() => props.onCancel()}>
          close
        </button>
      </form>
    </dialog>
  </Show>
)

export default ConfirmDialog
