import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { FileEntry, RecentProject } from '../shared/types'
import type {
  CreateLabelInput,
  ImageStatus,
  SaveMaskInput,
  SaveRectangleInput,
  UpdateLabelInput
} from '../shared/annotations'

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
  },
  project: {
    open: (rootPath: string): Promise<{ rootPath: string }> =>
      ipcRenderer.invoke('project:open', rootPath),
    close: (): Promise<void> => ipcRenderer.invoke('project:close')
  },
  labels: {
    list: (): Promise<import('../shared/annotations').Label[]> =>
      ipcRenderer.invoke('labels:list'),
    create: (input: CreateLabelInput): Promise<import('../shared/annotations').Label> =>
      ipcRenderer.invoke('labels:create', input),
    update: (input: UpdateLabelInput): Promise<import('../shared/annotations').Label> =>
      ipcRenderer.invoke('labels:update', input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('labels:delete', id)
  },
  images: {
    getOrCreate: (
      relativePath: string,
      width?: number,
      height?: number
    ): Promise<import('../shared/annotations').ImageRecord> =>
      ipcRenderer.invoke('images:get-or-create', relativePath, width, height),
    setStatus: (
      relativePath: string,
      status: ImageStatus
    ): Promise<import('../shared/annotations').ImageRecord> =>
      ipcRenderer.invoke('images:set-status', relativePath, status),
    listStatuses: (): Promise<Record<string, ImageStatus>> =>
      ipcRenderer.invoke('images:list-statuses')
  },
  shapes: {
    list: (relativePath: string): Promise<import('../shared/annotations').Shape[]> =>
      ipcRenderer.invoke('shapes:list', relativePath),
    saveRectangle: (
      input: SaveRectangleInput
    ): Promise<import('../shared/annotations').RectangleShape> =>
      ipcRenderer.invoke('shapes:save-rectangle', input),
    saveMask: (
      input: SaveMaskInput,
      data: ArrayBuffer
    ): Promise<import('../shared/annotations').MaskShape> =>
      ipcRenderer.invoke('shapes:save-mask', input, data),
    delete: (shapeId: string): Promise<void> => ipcRenderer.invoke('shapes:delete', shapeId),
    replaceImage: (
      relativePath: string,
      rectangles: SaveRectangleInput[],
      masks: { input: SaveMaskInput; data: ArrayBuffer }[],
      imageWidth?: number,
      imageHeight?: number
    ): Promise<import('../shared/annotations').Shape[]> =>
      ipcRenderer.invoke(
        'shapes:replace-image',
        relativePath,
        rectangles,
        masks,
        imageWidth,
        imageHeight
      )
  },
  masks: {
    get: (shapeId: string): Promise<import('../shared/annotations').MaskBlob | null> =>
      ipcRenderer.invoke('masks:get', shapeId)
  },
  paths: {
    toRelative: (rootPath: string, absolutePath: string): Promise<string> =>
      ipcRenderer.invoke('paths:to-relative', rootPath, absolutePath)
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
