export type AppMenuAction =
  | 'go-to-welcome'
  | 'open-folder'
  | 'open-recent'
  | 'project-settings'
  | 'import-annotations'
  | 'export-dataset'
  | 'platform-info'

export type AppMenuRecentProject = {
  path: string
  label: string
}

export type AppMenuState = {
  hasOpenProject: boolean
  recentProjects: AppMenuRecentProject[]
}
