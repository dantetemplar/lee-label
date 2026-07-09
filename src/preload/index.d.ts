import { ElectronAPI } from '@electron-toolkit/preload'
import type { FileEntry, RecentProject } from '../shared/types'

export interface AppAPI {
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<boolean>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    onMaximizedChange: (callback: (maximized: boolean) => void) => () => void
  }
  files: {
    openFolder: () => Promise<string | null>
    readDirectoryTree: (path: string) => Promise<FileEntry[]>
    readTextFile: (path: string) => Promise<string>
    writeTextFile: (path: string, content: string) => Promise<number>
  }
  recent: {
    get: () => Promise<RecentProject[]>
    add: (path: string) => Promise<RecentProject[]>
    exists: (path: string) => Promise<boolean>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppAPI
  }
}
