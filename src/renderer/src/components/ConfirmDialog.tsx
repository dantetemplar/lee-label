import type { Component, JSX } from 'solid-js'
import { createUniqueId } from 'solid-js'
import { BsExclamationCircleFill } from 'solid-icons/bs'
import FloatingModal from './FloatingModal'

const ConfirmDialog: Component<{
  open: () => boolean
  title: () => string
  message: () => string | JSX.Element
  confirmLabel?: string
  destructive?: boolean
  onCancel: () => void
  onConfirm: () => void
}> = (props) => {
  const titleId = createUniqueId()
  const messageId = createUniqueId()
  let confirmBtn: HTMLButtonElement | undefined

  return (
    <FloatingModal
      open={props.open}
      onClose={props.onCancel}
      onSubmit={props.onConfirm}
      role="alertdialog"
      labelledBy={titleId}
      describedBy={messageId}
      initialFocusEl={() => confirmBtn}
      panelClass="max-w-md p-5"
    >
      <div class="flex items-start gap-3">
        <BsExclamationCircleFill class="text-warning mt-0.5 shrink-0" size={22} aria-hidden="true" />
        <div class="min-w-0">
          <h2 id={titleId} class="text-base font-semibold leading-snug">
            {props.title()}
          </h2>
          <p id={messageId} class="text-base-content/70 mt-2 text-sm leading-relaxed">
            {props.message()}
          </p>
        </div>
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="btn btn-ghost" onClick={props.onCancel}>
          Cancel
        </button>
        <button
          type="button"
          ref={confirmBtn}
          class={`btn ${props.destructive ? 'btn-error' : 'btn-primary'}`}
          onClick={props.onConfirm}
        >
          {props.confirmLabel ?? 'OK'}
        </button>
      </div>
    </FloatingModal>
  )
}

export default ConfirmDialog
