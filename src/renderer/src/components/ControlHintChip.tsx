import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { parseMouseHintKey } from '../lib/mouse-button-keys'
import { KEYBOARD_HINT_OPACITY } from './KeyboardHint'
import MouseButtonHint, { MOUSE_HINT_LABELS } from './MouseButtonHint'

function hintPartLabel(key: string): string {
  const mouseHint = parseMouseHintKey(key)
  return mouseHint ? MOUSE_HINT_LABELS[mouseHint] : key
}

export function formatHintChordTitle(keys: readonly string[]): string {
  return keys.map(hintPartLabel).join('+')
}

const KeyboardChordChip: Component<{ keys: string[] }> = (props) => {
  if (props.keys.length === 1) {
    const key = props.keys[0]
    return (
      <kbd
        class={`kbd kbd-xs pointer-events-none inline-flex h-3.5 min-h-0 shrink-0 items-center px-1 text-[9px] leading-none ${KEYBOARD_HINT_OPACITY.default}`}
        title={key}
      >
        {key}
      </kbd>
    )
  }

  const title = formatHintChordTitle(props.keys)

  return (
    <kbd
      class={`kbd kbd-xs pointer-events-none inline-flex h-3.5 min-h-0 shrink-0 items-center gap-0.5 px-1 text-[9px] leading-none ${KEYBOARD_HINT_OPACITY.default}`}
      title={title}
      aria-label={title}
    >
      <For each={props.keys}>
        {(key, index) => (
          <>
            <Show when={index() > 0}>
              <span class="px-px text-[8px] opacity-45" aria-hidden="true">
                +
              </span>
            </Show>
            <span>{key}</span>
          </>
        )}
      </For>
    </kbd>
  )
}

const ControlHintChip: Component<{
  keys: string[]
}> = (props) => {
  const keyboardKeys = (): string[] => props.keys.filter((key) => !parseMouseHintKey(key))
  const mouseKeys = (): string[] => props.keys.filter((key) => parseMouseHintKey(key) !== null)

  if (keyboardKeys().length > 0 && mouseKeys().length > 0) {
    const title = formatHintChordTitle(props.keys)
    return (
      <span class="inline-flex items-center gap-0.5" title={title} aria-label={title}>
        <KeyboardChordChip keys={keyboardKeys()} />
        <For each={mouseKeys()}>{(key) => <MouseButtonHint hint={parseMouseHintKey(key)!} />}</For>
      </span>
    )
  }

  if (props.keys.length === 1) {
    const key = props.keys[0]
    const mouseHint = parseMouseHintKey(key)
    return mouseHint ? (
      <MouseButtonHint hint={mouseHint} />
    ) : (
      <KeyboardChordChip keys={props.keys} />
    )
  }

  return <KeyboardChordChip keys={props.keys} />
}

export default ControlHintChip
