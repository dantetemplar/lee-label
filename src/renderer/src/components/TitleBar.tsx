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
    <header class="flex h-[var(--titlebar-height)] min-h-[var(--titlebar-height)] items-center border-base-300 bg-base-200 text-base-content border-b [-webkit-app-region:drag]">
      <div class="flex items-center pl-2 [-webkit-app-region:no-drag]">
        <button
          type="button"
          class="btn btn-ghost btn-xs h-[var(--titlebar-height)] cursor-pointer rounded-none px-2.5 text-xs font-normal leading-[var(--titlebar-height)]"
          onClick={() => props.onOpenFolder()}
        >
          File
        </button>
        <span class="cursor-default px-2.5 text-xs leading-[var(--titlebar-height)] opacity-55">
          Edit
        </span>
        <span class="cursor-default px-2.5 text-xs leading-[var(--titlebar-height)] opacity-55">
          View
        </span>
        <span class="cursor-default px-2.5 text-xs leading-[var(--titlebar-height)] opacity-55">
          Help
        </span>
      </div>
      <div class="flex min-w-0 flex-1 items-center justify-center gap-2 px-20 text-xs text-base-content/60">
        <AppLogo size={16} class="shrink-0" />
        <span class="truncate">{props.title()}</span>
      </div>
      <div class="flex [-webkit-app-region:no-drag]">
        <button
          type="button"
          class="btn btn-ghost btn-xs h-[var(--titlebar-height)] min-h-[var(--titlebar-height)] w-[46px] rounded-none"
          aria-label="Minimize"
          onClick={() => window.api.window.minimize()}
        >
          <BsDash size={10} aria-hidden="true" />
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-xs h-[var(--titlebar-height)] min-h-[var(--titlebar-height)] w-[46px] rounded-none"
          aria-label={maximized() ? 'Restore' : 'Maximize'}
          onClick={() => window.api.window.toggleMaximize()}
        >
          <Show when={maximized()} fallback={<BsSquare size={10} aria-hidden="true" />}>
            <BsWindowStack size={10} aria-hidden="true" />
          </Show>
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-xs h-[var(--titlebar-height)] min-h-[var(--titlebar-height)] w-[46px] rounded-none hover:bg-error hover:text-error-content"
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
