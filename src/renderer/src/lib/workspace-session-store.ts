import { createSignal } from 'solid-js'
import type { WorkspaceSession } from '../../../shared/workspace-session'
import { EMPTY_WORKSPACE_SESSION } from '../../../shared/workspace-session'

const PERSIST_DEBOUNCE_MS = 300

export interface WorkspaceSessionStore {
  load: () => Promise<void>
  clear: () => void
  flush: () => Promise<void>
  setLastImage: (relativePath: string | null) => void
  getLastImageRelativePath: () => string | null
}

export function createWorkspaceSessionStore(): WorkspaceSessionStore {
  const [session, setSession] = createSignal<WorkspaceSession>(EMPTY_WORKSPACE_SESSION)
  let projectOpen = false
  let persistTimer: ReturnType<typeof setTimeout> | undefined

  const schedulePersist = (): void => {
    if (!projectOpen) return
    if (persistTimer !== undefined) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = undefined
      void window.api.project.setWorkspaceSession(session())
    }, PERSIST_DEBOUNCE_MS)
  }

  return {
    async load(): Promise<void> {
      const loaded = await window.api.project.getWorkspaceSession()
      setSession({ lastImageRelativePath: loaded.lastImageRelativePath ?? null })
      projectOpen = true
    },

    clear(): void {
      if (persistTimer !== undefined) {
        clearTimeout(persistTimer)
        persistTimer = undefined
      }
      setSession(EMPTY_WORKSPACE_SESSION)
      projectOpen = false
    },

    async flush(): Promise<void> {
      if (!projectOpen) return
      if (persistTimer !== undefined) {
        clearTimeout(persistTimer)
        persistTimer = undefined
      }
      await window.api.project.setWorkspaceSession(session())
    },

    setLastImage(relativePath: string | null): void {
      setSession((current) => {
        if (current.lastImageRelativePath === relativePath) return current
        return { lastImageRelativePath: relativePath }
      })
      schedulePersist()
    },

    getLastImageRelativePath(): string | null {
      return session().lastImageRelativePath
    }
  }
}
