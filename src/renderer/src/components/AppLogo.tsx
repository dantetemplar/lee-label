import type { Component } from 'solid-js'
import logoUrl from '@logo'

const AppLogo: Component<{ size?: number; class?: string }> = (props) => (
  <img
    src={logoUrl}
    alt=""
    aria-hidden="true"
    class={props.class}
    width={props.size ?? 48}
    height={props.size ?? 48}
    draggable={false}
  />
)

export default AppLogo
