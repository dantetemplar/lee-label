import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { FileEntry, RecentProject } from '../shared/types'

const api = {
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, maximized: boolean): void =>
        callback(maximized)
      ipcRenderer.on('window:maximized-changed', handler)
      return () => ipcRenderer.removeListener('window:maximized-changed', handler)
    }
  },
  files: {
    openFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-folder'),
    readDirectoryTree: (path: string): Promise<FileEntry[]> =>
      ipcRenderer.invoke('fs:read-directory-tree', path),
    readTextFile: (path: string): Promise<string> => ipcRenderer.invoke('fs:read-text-file', path),
    writeTextFile: (path: string, content: string): Promise<number> =>
      ipcRenderer.invoke('fs:write-text-file', path, content)
  },
  recent: {
    get: (): Promise<RecentProject[]> => ipcRenderer.invoke('recent:get'),
    add: (path: string): Promise<RecentProject[]> => ipcRenderer.invoke('recent:add', path),
    exists: (path: string): Promise<boolean> => ipcRenderer.invoke('recent:exists', path)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
