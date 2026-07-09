import type { Component } from 'solid-js'
import { For, Show, createSignal } from 'solid-js'
import type { RecentProject } from '../../../shared/types'
import { APP_DISPLAY_NAME } from '../../../shared/app-name'
import AppLogo from './AppLogo'
import {
  getRecentProjectFullLabel,
  getRecentProjectParentLabel,
  truncatePathStart
} from '../lib/recent-project-path'

const RECENT_PREVIEW_COUNT = 5

const FolderIcon: Component = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M3 7C3 5.9 3.9 5 5 5H9.5L11.5 7H19C20.1 7 21 7.9 21 9V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V7Z"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    />
  </svg>
)

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
    <div class="welcome-screen bg-base-100 text-base-content">
      <div class="welcome-content">
        <header class="welcome-header">
          <div class="welcome-brand">
            <AppLogo size={43} class="welcome-logo" />
            <h1 class="welcome-title">{APP_DISPLAY_NAME}</h1>
          </div>
        </header>

        <div class="welcome-actions">
          <button type="button" class="welcome-action" onClick={() => props.onOpenFolder()}>
            <FolderIcon />
            <span>Open project</span>
          </button>
        </div>

        <Show when={props.recentProjects().length > 0}>
          <section class="welcome-recent">
            <div class="welcome-recent-header">
              <span class="welcome-recent-heading">Recent projects</span>
              <Show when={hasMoreRecent()}>
                <button
                  type="button"
                  class="welcome-recent-view-all"
                  onClick={() => setShowAllRecent((value) => !value)}
                >
                  {showAllRecent() ? 'Show less' : `View all (${props.recentProjects().length})`}
                </button>
              </Show>
            </div>
            <ul class="welcome-recent-list">
              <For each={visibleRecent()}>
                {(project) => (
                  <li>
                    <button
                      type="button"
                      class="welcome-recent-item"
                      title={getRecentProjectFullLabel(project)}
                      onClick={() => props.onOpenRecent(project.path)}
                    >
                      <span class="welcome-recent-name">{project.name}</span>
                      <span class="welcome-recent-path">
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
