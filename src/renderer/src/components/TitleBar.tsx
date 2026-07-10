import type { Component } from 'solid-js'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { BsDash, BsSquare, BsWindowStack, BsX } from 'solid-icons/bs'
import AppLogo from './AppLogo'

const TitleBar: Component<{ title: () => string; onOpenFolder: () => void }> = (props) => {
  const [maximized, setMaximized] = createSignal(false)

  onMount(() => {
    void window.api.window.isMaximized().then(setMaximized)
    const cleanup = window.api.window.onMaximizedChange(setMaximized)
    onCleanup(cleanup)
  })

  return (
    <header class="titlebar border-base-300 bg-base-200 text-base-content border-b">
      <div class="titlebar-menus">
        <button
          type="button"
          class="titlebar-menu hover:bg-base-300"
          onClick={() => props.onOpenFolder()}
        >
          File
        </button>
        <span class="titlebar-menu opacity-55">Edit</span>
        <span class="titlebar-menu opacity-55">View</span>
        <span class="titlebar-menu opacity-55">Help</span>
      </div>
      <div class="titlebar-center text-base-content/60">
        <AppLogo size={16} class="titlebar-logo" />
        <span class="titlebar-title">{props.title()}</span>
      </div>
      <div class="titlebar-controls">
        <button
          type="button"
          class="titlebar-btn hover:bg-base-300"
          aria-label="Minimize"
          onClick={() => window.api.window.minimize()}
        >
          <BsDash size={10} aria-hidden="true" />
        </button>
        <button
          type="button"
          class="titlebar-btn hover:bg-base-300"
          aria-label={maximized() ? 'Restore' : 'Maximize'}
          onClick={() => window.api.window.toggleMaximize()}
        >
          <Show when={maximized()} fallback={<BsSquare size={10} aria-hidden="true" />}>
            <BsWindowStack size={10} aria-hidden="true" />
          </Show>
        </button>
        <button
          type="button"
          class="titlebar-btn hover:bg-error hover:text-error-content"
          aria-label="Close"
          onClick={() => window.api.window.close()}
        >
          <BsX size={10} aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

export default TitleBar
