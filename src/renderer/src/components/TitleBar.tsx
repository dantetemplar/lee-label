import type { Component } from 'solid-js'
import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { BsChevronRight, BsDash, BsSquare, BsWindowStack, BsX } from 'solid-icons/bs'
import type { RecentProject } from '../../../shared/types'
import { getRecentProjectFullLabel } from '../lib/recent-project-path'
import AppLogo from './AppLogo'

const menuPanelClass =
  'rounded-md border border-base-300 bg-base-200 py-1.5 shadow-lg'

const menuItemClass =
  'flex w-full items-center gap-2.5 px-3.5 py-1.5 text-left text-[13px] leading-none text-base-content/88 hover:bg-base-300 disabled:pointer-events-none disabled:opacity-40'

const TitleBar: Component<{
  title: () => string
  hasOpenProject: () => boolean
  recentProjects: () => RecentProject[]
  onGoToWelcomeScreen: () => void
  onOpenFolder: () => void
  onOpenRecent: (path: string) => void
}> = (props) => {
  const [maximized, setMaximized] = createSignal(false)
  const [fileMenuOpen, setFileMenuOpen] = createSignal(false)
  const [recentSubmenuOpen, setRecentSubmenuOpen] = createSignal(false)
  const [fileMenuRoot, setFileMenuRoot] = createSignal<HTMLDivElement>()

  const closeFileMenu = (): void => {
    setFileMenuOpen(false)
    setRecentSubmenuOpen(false)
  }

  const toggleFileMenu = (event: MouseEvent): void => {
    event.stopPropagation()
    if (fileMenuOpen()) {
      closeFileMenu()
      return
    }
    setRecentSubmenuOpen(false)
    setFileMenuOpen(true)
  }

  const openRecentSubmenu = (): void => {
    setRecentSubmenuOpen(true)
  }

  const closeRecentSubmenu = (): void => {
    setRecentSubmenuOpen(false)
  }

  createEffect(() => {
    if (!fileMenuOpen()) return

    const handleClick = (event: MouseEvent): void => {
      const root = fileMenuRoot()
      if (root?.contains(event.target as Node)) return
      closeFileMenu()
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeFileMenu()
    }

    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)

    onCleanup(() => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    })
  })

  onMount(() => {
    void window.api.window.isMaximized().then(setMaximized)
    const cleanup = window.api.window.onMaximizedChange(setMaximized)
    onCleanup(cleanup)
  })

  return (
    <header class="flex h-[var(--titlebar-height)] min-h-[var(--titlebar-height)] items-center border-base-300 bg-base-200 text-base-content border-b [-webkit-app-region:drag]">
      <div class="flex items-center gap-1 pl-2 [-webkit-app-region:no-drag]">
        <AppLogo size={16} class="mx-1 shrink-0" />
        <div class="relative" ref={setFileMenuRoot}>
          <button
            type="button"
            class="btn btn-ghost btn-xs h-[var(--titlebar-height)] cursor-pointer rounded-none px-2.5 text-xs font-normal leading-[var(--titlebar-height)]"
            classList={{ 'bg-base-300': fileMenuOpen() }}
            aria-haspopup="menu"
            aria-expanded={fileMenuOpen()}
            onClick={toggleFileMenu}
          >
            File
          </button>
          <Show when={fileMenuOpen()}>
            <div
              class={`absolute top-full left-0 z-50 min-w-[220px] ${menuPanelClass}`}
              role="menu"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                class={menuItemClass}
                disabled={!props.hasOpenProject()}
                onClick={() => {
                  closeFileMenu()
                  props.onGoToWelcomeScreen()
                }}
              >
                Go to Welcome Screen
              </button>
              <button
                type="button"
                role="menuitem"
                class={menuItemClass}
                onClick={() => {
                  closeFileMenu()
                  props.onOpenFolder()
                }}
              >
                Open Folder
              </button>
              <div
                class="relative"
                onMouseEnter={openRecentSubmenu}
                onMouseLeave={closeRecentSubmenu}
              >
                <button
                  type="button"
                  role="menuitem"
                  class={`${menuItemClass} justify-between`}
                  classList={{ 'bg-base-300': recentSubmenuOpen() }}
                  aria-haspopup="menu"
                  aria-expanded={recentSubmenuOpen()}
                >
                  <span>Open Recent</span>
                  <BsChevronRight size={10} class="shrink-0 opacity-50" aria-hidden="true" />
                </button>
                <Show when={recentSubmenuOpen()}>
                  <div
                    class={`absolute top-0 left-full z-50 -ml-px min-w-[280px] max-w-[420px] rounded-l-none ${menuPanelClass}`}
                    role="menu"
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <Show
                      when={props.recentProjects().length > 0}
                      fallback={
                        <span class="block px-3.5 py-1.5 text-[13px] text-base-content/40">
                          No recent projects
                        </span>
                      }
                    >
                      <For each={props.recentProjects()}>
                        {(project) => (
                          <button
                            type="button"
                            role="menuitem"
                            class={menuItemClass}
                            title={getRecentProjectFullLabel(project)}
                            onClick={() => {
                              closeFileMenu()
                              props.onOpenRecent(project.path)
                            }}
                          >
                            <span class="min-w-0 truncate">{getRecentProjectFullLabel(project)}</span>
                          </button>
                        )}
                      </For>
                    </Show>
                  </div>
                </Show>
              </div>
              <div class="my-1 border-t border-base-300" role="separator" />
              <button
                type="button"
                role="menuitem"
                class={menuItemClass}
                onClick={() => {
                  closeFileMenu()
                  window.api.window.close()
                }}
              >
                Exit
              </button>
            </div>
          </Show>
        </div>
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
      <div class="flex min-w-0 flex-1 items-center justify-center px-20 text-xs text-base-content/60">
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
