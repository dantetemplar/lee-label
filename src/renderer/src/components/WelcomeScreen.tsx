import type { Component } from 'solid-js'
import { For, Show, createSignal } from 'solid-js'
import { BsFolder2Open } from 'solid-icons/bs'
import type { RecentProject } from '../../../shared/types'
import { APP_DISPLAY_NAME } from '../../../shared/app-name'
import AppLogo from './AppLogo'
import {
  getRecentProjectFullLabel,
  getRecentProjectParentLabel,
  truncatePathStart
} from '../lib/recent-project-path'

const RECENT_PREVIEW_COUNT = 5

const WelcomeScreen: Component<{
  recentProjects: () => RecentProject[]
  onOpenFolder: () => void
  onOpenRecent: (path: string) => void
}> = (props) => {
  const [showAllRecent, setShowAllRecent] = createSignal(false)

  const visibleRecent = (): RecentProject[] => {
    const projects = props.recentProjects()
    if (showAllRecent() || projects.length <= RECENT_PREVIEW_COUNT) return projects
    return projects.slice(0, RECENT_PREVIEW_COUNT)
  }

  const hasMoreRecent = (): boolean => props.recentProjects().length > RECENT_PREVIEW_COUNT

  return (
    <div class="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto bg-base-100 p-12 text-base-content">
      <div class="w-full max-w-[480px]">
        <header class="mb-7 flex flex-col items-start">
          <div class="flex items-center gap-1.5">
            <AppLogo size={43} class="block shrink-0" />
            <h1 class="m-0 text-[22px] leading-none font-bold tracking-wide">{APP_DISPLAY_NAME}</h1>
          </div>
        </header>

        <div class="mb-9 flex w-full justify-start gap-3">
          <button
            type="button"
            class="flex w-1/3 min-w-[120px] cursor-pointer flex-col items-start justify-center gap-2 rounded-lg border border-base-content/10 bg-[color-mix(in_oklab,var(--color-base-200)_55%,var(--color-base-100))] px-3.5 py-2.5 font-inherit text-[13px] font-medium leading-none text-base-content/88 transition-[background,border-color,color] duration-150 hover:border-base-content/16 hover:bg-base-300 hover:text-base-content focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
            onClick={() => props.onOpenFolder()}
          >
            <BsFolder2Open size={20} aria-hidden="true" />
            <span>Open project</span>
          </button>
        </div>

        <Show when={props.recentProjects().length > 0}>
          <section class="w-full">
            <div class="mb-1.5 flex items-center justify-between">
              <span class="text-[13px] font-medium text-base-content/48">Recent projects</span>
              <Show when={hasMoreRecent()}>
                <button
                  type="button"
                  class="btn btn-ghost btn-link btn-sm h-auto min-h-0 px-0 no-underline"
                  onClick={() => setShowAllRecent((value) => !value)}
                >
                  {showAllRecent() ? 'Show less' : `View all (${props.recentProjects().length})`}
                </button>
              </Show>
            </div>
            <ul class="m-0 list-none p-0">
              <For each={visibleRecent()}>
                {(project) => (
                  <li>
                    <button
                      type="button"
                      class="btn btn-ghost flex h-auto min-h-0 w-full items-center justify-between gap-3 px-0 text-[13px] font-normal focus-visible:bg-base-300"
                      title={getRecentProjectFullLabel(project)}
                      onClick={() => props.onOpenRecent(project.path)}
                    >
                      <span class="max-w-[50%] min-w-0 truncate font-medium text-base-content/82">
                        {project.name}
                      </span>
                      <span class="max-w-[55%] min-w-0 truncate text-right text-xs text-base-content/48">
                        {truncatePathStart(getRecentProjectParentLabel(project))}
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>
      </div>
    </div>
  )
}

export default WelcomeScreen
