import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import type { RecentProject } from '../../../shared/types'

const FolderIcon: Component = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
    <path
      d="M4 8C4 6.9 4.9 6 6 6H12L14 8H26C27.1 8 28 8.9 28 10V24C28 25.1 27.1 26 26 26H6C4.9 26 4 25.1 4 24V8Z"
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
}> = (props) => (
  <div class="welcome-screen bg-base-100 text-base-content">
    <div class="welcome-content">
      <h1 class="welcome-title">lee-label</h1>

      <div class="welcome-actions">
        <button type="button" class="welcome-action" onClick={() => props.onOpenFolder()}>
          <FolderIcon />
          <span>Open project</span>
        </button>
      </div>

      <Show when={props.recentProjects().length > 0}>
        <div class="welcome-recent">
          <div class="welcome-recent-header">
            <span>Recent projects</span>
          </div>
          <ul class="welcome-recent-list">
            <For each={props.recentProjects()}>
              {(project) => (
                <li>
                  <button
                    type="button"
                    class="welcome-recent-item"
                    onClick={() => props.onOpenRecent(project.path)}
                  >
                    <span class="welcome-recent-name">{project.name}</span>
                    <span class="welcome-recent-path">{project.displayPath}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  </div>
)

export default WelcomeScreen
