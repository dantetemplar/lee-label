export interface WorkspaceSession {
  lastImageRelativePath: string | null
}

export const SETTINGS_KEY_WORKSPACE_SESSION = 'workspace_session'

export const EMPTY_WORKSPACE_SESSION: WorkspaceSession = {
  lastImageRelativePath: null
}
