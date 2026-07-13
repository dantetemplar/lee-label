import type { Component } from 'solid-js'
import { Match, Switch } from 'solid-js'
import type { MouseHint } from '../lib/mouse-button-keys'

const LABELS: Record<MouseHint, string> = {
  left: 'Left mouse button',
  right: 'Right mouse button',
  middle: 'Middle mouse button',
  scroll: 'Mouse wheel'
}

export const MOUSE_HINT_LABELS = LABELS

export const MouseHintIcon: Component<{ hint: MouseHint; compact?: boolean }> = (props) => (
  <svg
    viewBox="0 0 12 16"
    class={props.compact ? 'h-2.5 w-[9px] shrink-0' : 'h-3.5 w-[11px] shrink-0'}
    aria-hidden="true"
    fill="currentColor"
  >
    <path
      d="M6 1.25C3.65 1.25 1.75 3.3 1.75 5.85v4.3c0 2.55 1.9 4.6 4.25 4.6s4.25-2.05 4.25-4.6v-4.3C10.25 3.3 8.35 1.25 6 1.25z"
      fill="none"
      stroke="currentColor"
      stroke-width="1.1"
    />
    <path d="M6 1.25V8M1.75 8h8.5" fill="none" stroke="currentColor" stroke-width="0.9" />
    <Switch>
      <Match when={props.hint === 'left'}>
        <path d="M6 1.25C4.2 1.25 2.75 2.95 2.75 5V8H6V1.25z" />
      </Match>
      <Match when={props.hint === 'right'}>
        <path d="M6 1.25h1.25C8.8 1.25 10.25 2.95 10.25 5V8H6V1.25z" />
      </Match>
      <Match when={props.hint === 'middle'}>
        <rect x="5.15" y="2.2" width="1.7" height="3.2" rx="0.85" />
      </Match>
      <Match when={props.hint === 'scroll'}>
        <rect x="5.15" y="2.2" width="1.7" height="3.2" rx="0.85" />
        <path
          d="M6 1.05 5.35 1.75H6.65L6 1.05zM6 6.55 5.35 5.85H6.65L6 6.55z"
          fill="currentColor"
        />
      </Match>
    </Switch>
  </svg>
)

const MouseButtonHint: Component<{
  hint: MouseHint
}> = (props) => (
  <span
    class="pointer-events-none inline-flex shrink-0 items-center text-base-content/70"
    title={LABELS[props.hint]}
    aria-label={LABELS[props.hint]}
  >
    <MouseHintIcon hint={props.hint} />
  </span>
)

export default MouseButtonHint
