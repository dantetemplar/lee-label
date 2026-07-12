import type { Accessor, Component, JSX } from 'solid-js'

export const KEYBOARD_HINT_OPACITY = {
  default: 'opacity-70',
  emphasized: 'opacity-100',
  pressed: 'opacity-100',
  disabled: 'opacity-25'
} as const

const SIZE_CLASS = {
  sm: 'h-3.5 min-h-0 px-1 text-[9px]',
  md: 'h-4 min-h-0 min-w-4 px-1.5 text-[11px]'
} as const

const PRESSED_CLASS =
  'bg-base-content/12 shadow-[inset_0_1px_2px_color-mix(in_oklab,var(--color-base-content)_16%,transparent)]'

const KeyboardHint: Component<{
  size?: keyof typeof SIZE_CLASS
  emphasized?: Accessor<boolean>
  pressed?: Accessor<boolean>
  disabled?: Accessor<boolean>
  title?: string
  children: JSX.Element
}> = (props) => {
  const opacityClass = (): string => {
    if (props.disabled?.()) return KEYBOARD_HINT_OPACITY.disabled
    if (props.pressed?.()) return KEYBOARD_HINT_OPACITY.pressed
    if (props.emphasized?.()) return KEYBOARD_HINT_OPACITY.emphasized
    return KEYBOARD_HINT_OPACITY.default
  }

  return (
    <kbd
      class={`kbd kbd-xs pointer-events-none shrink-0 leading-none ${SIZE_CLASS[props.size ?? 'sm']} ${opacityClass()} ${props.pressed?.() ? PRESSED_CLASS : ''}`}
      title={props.title}
      aria-disabled={props.disabled?.() ?? false}
    >
      {props.children}
    </kbd>
  )
}

export default KeyboardHint
