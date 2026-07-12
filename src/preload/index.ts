import { contextBridge, ipcRenderer } from 'electron'
import type { FileEntry, RecentProject } from '../shared/types'
import type {
  AnnotationStats,
  CreateLabelInput,
  ImageStatus,
  SaveMaskInput,
  SavePolygonInput,
  SaveRectangleInput,
  SemanticMaskBlob,
  UpdateLabelInput
} from '../shared/annotations'
import type { ProjectSettings, SegmentationMode } from '../shared/segmentation'
import type { YoloImportOptions, YoloImportPreview, YoloImportResult } from '../shared/import'
import type {
  YoloExportOptions,
  YoloExportPreview,
  YoloExportProgress,
  YoloExportResult
} from '../shared/export'

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
  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url)
  },
  files: {
    openFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-folder'),
    saveFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:save-folder'),
    openFile: (
      filters?: { name: string; extensions: string[] }[]
    ): Promise<string | null> => ipcRenderer.invoke('dialog:open-file', filters),
    readDirectoryTree: (path: string): Promise<FileEntry[]> =>
      ipcRenderer.invoke('fs:read-directory-tree', path),
    readTextFile: (path: string): Promise<string> => ipcRenderer.invoke('fs:read-text-file', path),
    writeTextFile: (path: string, content: string): Promise<number> =>
      ipcRenderer.invoke('fs:write-text-file', path, content)
  },
  recent: {
    get: (): Promise<RecentProject[]> => ipcRenderer.invoke('recent:get'),
    add: (path: string): Promise<RecentProject[]> => ipcRenderer.invoke('recent:add', path),
    remove: (path: string): Promise<RecentProject[]> => ipcRenderer.invoke('recent:remove', path),
    exists: (path: string): Promise<boolean> => ipcRenderer.invoke('recent:exists', path)
  },
  paths: {
    formatDisplay: (path: string): Promise<string> => ipcRenderer.invoke('paths:format-display', path)
  },
  project: {
    open: (rootPath: string): Promise<{ rootPath: string } & ProjectSettings> =>
      ipcRenderer.invoke('project:open', rootPath),
    close: (): Promise<void> => ipcRenderer.invoke('project:close'),
    update: (input: {
      name?: string
      segmentationMode?: SegmentationMode
    }): Promise<ProjectSettings> => ipcRenderer.invoke('project:update', input),
    getAnnotationStats: (): Promise<AnnotationStats> =>
      ipcRenderer.invoke('project:get-annotation-stats')
  },
  labels: {
    list: (): Promise<import('../shared/annotations').Label[]> =>
      ipcRenderer.invoke('labels:list'),
    create: (input: CreateLabelInput): Promise<import('../shared/annotations').Label> =>
      ipcRenderer.invoke('labels:create', input),
    update: (input: UpdateLabelInput): Promise<import('../shared/annotations').Label> =>
      ipcRenderer.invoke('labels:update', input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('labels:delete', id),
    getDeleteStats: (
      id: string
    ): Promise<import('../shared/annotations').LabelDeleteStats> =>
      ipcRenderer.invoke('labels:get-delete-stats', id)
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
    replaceImage: (
      relativePath: string,
      rectangles: SaveRectangleInput[],
      masks: { input: SaveMaskInput; data: ArrayBuffer }[],
      polygons: SavePolygonInput[],
      imageWidth?: number,
      imageHeight?: number
    ): Promise<import('../shared/annotations').Shape[]> =>
      ipcRenderer.invoke(
        'shapes:replace-image',
        relativePath,
        rectangles,
        masks,
        polygons,
        imageWidth,
        imageHeight
      )
  },
  masks: {
    get: (shapeId: string): Promise<import('../shared/annotations').MaskBlob | null> =>
      ipcRenderer.invoke('masks:get', shapeId)
  },
  semanticMasks: {
    get: (
      relativePath: string
    ): Promise<{ width: number; height: number; data: ArrayBuffer } | null> =>
      ipcRenderer.invoke('semantic-masks:get', relativePath),
    save: (
      relativePath: string,
      width: number,
      height: number,
      classMap: ArrayBuffer
    ): Promise<SemanticMaskBlob> =>
      ipcRenderer.invoke('semantic-masks:save', relativePath, width, height, classMap)
  },
  import: {
    yoloUltralyticsPreview: (options: YoloImportOptions): Promise<YoloImportPreview> =>
      ipcRenderer.invoke('import:yolo-ultralytics-preview', options),
    yoloUltralytics: (options: YoloImportOptions): Promise<YoloImportResult> =>
      ipcRenderer.invoke('import:yolo-ultralytics', options)
  },
  export: {
    yoloUltralyticsPreview: (options: YoloExportOptions): Promise<YoloExportPreview> =>
      ipcRenderer.invoke('export:yolo-ultralytics-preview', options),
    yoloUltralytics: (options: YoloExportOptions): Promise<YoloExportResult> =>
      ipcRenderer.invoke('export:yolo-ultralytics', options),
    cancelYoloUltralytics: (): Promise<void> =>
      ipcRenderer.invoke('export:yolo-ultralytics-cancel'),
    onYoloUltralyticsProgress: (callback: (progress: YoloExportProgress) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, progress: YoloExportProgress): void =>
        callback(progress)
      ipcRenderer.on('export:yolo-ultralytics-progress', handler)
      return () => ipcRenderer.removeListener('export:yolo-ultralytics-progress', handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
