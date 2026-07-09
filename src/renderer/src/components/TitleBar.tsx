import type { Component } from 'solid-js'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'

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
      <div class="titlebar-center text-base-content/60">{props.title()}</div>
      <div class="titlebar-controls">
        <button
          type="button"
          class="titlebar-btn hover:bg-base-300"
          aria-label="Minimize"
          onClick={() => window.api.window.minimize()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          class="titlebar-btn hover:bg-base-300"
          aria-label={maximized() ? 'Restore' : 'Maximize'}
          onClick={() => window.api.window.toggleMaximize()}
        >
          <Show
            when={maximized()}
            fallback={
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect
                  x="0.5"
                  y="0.5"
                  width="9"
                  height="9"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1"
                />
              </svg>
            }
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path
                d="M2 0.5H9.5V8H8.5V1.5H2V0.5ZM0.5 2V9.5H8V8.5H1.5V2H0.5Z"
                fill="currentColor"
              />
            </svg>
          </Show>
        </button>
        <button
          type="button"
          class="titlebar-btn hover:bg-error hover:text-error-content"
          aria-label="Close"
          onClick={() => window.api.window.close()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path
              d="M1 0.5L0.5 1L4.5 5L0.5 9L1 9.5L5 5.5L9 9.5L9.5 9L5.5 5L9.5 1L9 0.5L5 4.5L1 0.5Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
    </header>
  )
}

export default TitleBar
