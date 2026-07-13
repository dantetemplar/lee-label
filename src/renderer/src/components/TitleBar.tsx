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

const menuTriggerClass =
  'btn btn-ghost btn-xs h-[var(--titlebar-height)] cursor-pointer rounded-none px-2.5 text-xs font-normal leading-[var(--titlebar-height)] hover:bg-base-300 focus:bg-transparent focus-visible:bg-base-300'

type OpenMenu = 'file' | 'import' | 'export' | null

const TitleBar: Component<{
  title: () => string
  hasOpenProject: () => boolean
  recentProjects: () => RecentProject[]
  onGoToWelcomeScreen: () => void
  onOpenFolder: () => void
  onOpenRecent: (path: string) => void
  onProjectSettings: () => void
  onImportAnnotations: () => void
  onExportDataset: () => void
}> = (props) => {
  const [maximized, setMaximized] = createSignal(false)
  const [openMenu, setOpenMenu] = createSignal<OpenMenu>(null)
  const [recentSubmenuOpen, setRecentSubmenuOpen] = createSignal(false)
  const [menuBarRoot, setMenuBarRoot] = createSignal<HTMLDivElement>()

  const clearMenuChrome = (): void => {
    const root = menuBarRoot()
    const active = document.activeElement
    if (root && active instanceof HTMLElement && root.contains(active)) {
      active.blur()
    }
    // Dropdown overlays can swallow mouseleave; drop sticky :hover paint.
    if (!root) return
    root.style.pointerEvents = 'none'
    requestAnimationFrame(() => {
      root.style.pointerEvents = ''
    })
  }

  const closeMenus = (): void => {
    setOpenMenu(null)
    setRecentSubmenuOpen(false)
    clearMenuChrome()
  }

  const toggleMenu = (menu: Exclude<OpenMenu, null>, event: MouseEvent): void => {
    event.stopPropagation()
    if (openMenu() === menu) {
      closeMenus()
      return
    }
    setRecentSubmenuOpen(false)
    setOpenMenu(menu)
  }

  createEffect(() => {
    if (!openMenu()) return

    const handleClick = (event: MouseEvent): void => {
      const root = menuBarRoot()
      if (root?.contains(event.target as Node)) return
      closeMenus()
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closeMenus()
    }

    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown, true)

    onCleanup(() => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown, true)
    })
  })

  onMount(() => {
    void window.api.window.isMaximized().then(setMaximized)
    const cleanup = window.api.window.onMaximizedChange(setMaximized)
    onCleanup(cleanup)
  })

  return (
    <header class="flex h-[var(--titlebar-height)] min-h-[var(--titlebar-height)] items-center border-base-300 bg-base-200 text-base-content border-b [-webkit-app-region:drag]">
      <div class="flex items-center gap-1 pl-2 [-webkit-app-region:no-drag]" ref={setMenuBarRoot}>
        <AppLogo size={16} class="mx-1 shrink-0" />
        <div class="relative">
          <button
            type="button"
            class={menuTriggerClass}
            classList={{ 'bg-base-300!': openMenu() === 'file' }}
            aria-haspopup="menu"
            aria-expanded={openMenu() === 'file'}
            onClick={(event) => toggleMenu('file', event)}
          >
            File
          </button>
          <Show when={openMenu() === 'file'}>
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
                  closeMenus()
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
                  closeMenus()
                  props.onOpenFolder()
                }}
              >
                Open Folder
              </button>
              <div
                class="relative"
                onMouseEnter={() => setRecentSubmenuOpen(true)}
                onMouseLeave={() => setRecentSubmenuOpen(false)}
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
                              closeMenus()
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
                  closeMenus()
                  window.api.window.close()
                }}
              >
                Exit
              </button>
            </div>
          </Show>
        </div>
        <button
          type="button"
          class={menuTriggerClass}
          disabled={!props.hasOpenProject()}
          onClick={(event) => {
            closeMenus()
            event.currentTarget.blur()
            props.onProjectSettings()
          }}
        >
          Project settings
        </button>
        <div class="relative">
          <button
            type="button"
            class={menuTriggerClass}
            classList={{ 'bg-base-300!': openMenu() === 'import' }}
            aria-haspopup="menu"
            aria-expanded={openMenu() === 'import'}
            onClick={(event) => toggleMenu('import', event)}
          >
            Import
          </button>
          <Show when={openMenu() === 'import'}>
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
                  closeMenus()
                  props.onImportAnnotations()
                }}
              >
                Annotations…
              </button>
            </div>
          </Show>
        </div>
        <div class="relative">
          <button
            type="button"
            class={menuTriggerClass}
            classList={{ 'bg-base-300!': openMenu() === 'export' }}
            aria-haspopup="menu"
            aria-expanded={openMenu() === 'export'}
            onClick={(event) => toggleMenu('export', event)}
          >
            Export
          </button>
          <Show when={openMenu() === 'export'}>
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
                  closeMenus()
                  props.onExportDataset()
                }}
              >
                Dataset…
              </button>
            </div>
          </Show>
        </div>
        <button
          type="button"
          class={menuTriggerClass}
          onClick={(event) => {
            closeMenus()
            event.currentTarget.blur()
            void window.api.shell.openExternal('https://github.com/dantetemplar/lee-label.git')
          }}
        >
          Help
        </button>
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
