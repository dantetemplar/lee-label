import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { BsX } from 'solid-icons/bs'
import type { TopologyAlert } from '../lib/polygon/topology-session'

const TopologyAlertBanner: Component<{
  alert: () => TopologyAlert | null
  onLeft: () => boolean
  onDismissFocus: () => void
}> = (props) => (
  <Show when={props.alert()}>
    {(alert) => (
      <div
        class="alert alert-error alert-vertical absolute bottom-3 z-20 w-80 max-w-[calc(100%-1.5rem)] cursor-default rounded-none border border-error/40 bg-base-100 text-base-content px-3 py-2 shadow-lg"
        classList={{
          'right-3': !props.onLeft(),
          'left-3': props.onLeft()
        }}
        role="alert"
      >
        <p class="min-w-0 pr-8 text-sm leading-snug">{alert().message}</p>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square absolute top-1 right-1 z-10 cursor-pointer text-base-content shadow-none"
          aria-label="Dismiss"
          onClick={() => {
            alert().onDismiss()
            queueMicrotask(props.onDismissFocus)
          }}
        >
          <BsX size={18} aria-hidden="true" />
        </button>
      </div>
    )}
  </Show>
)

export default TopologyAlertBanner
