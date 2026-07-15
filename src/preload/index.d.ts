import type {
  AnnotationStats,
  CreateLabelInput,
  ImageRecord,
  ImageStatus,
  Label,
  LabelDeleteStats,
  MaskBlob,
  SaveMaskInput,
  SavePolygonInput,
  SaveRectangleInput,
  SemanticMaskBlob,
  Shape,
  UpdateLabelInput
} from '../shared/annotations'
import type { ProjectSettings, SegmentationMode } from '../shared/segmentation'
import type { WorkspaceSession } from '../shared/workspace-session'
import type { YoloImportOptions, YoloImportPreview, YoloImportResult } from '../shared/import'
import type {
  YoloExportOptions,
  YoloExportPreview,
  YoloExportProgress,
  YoloExportResult
} from '../shared/export'
import type { GpuFeatureStatus, RuntimeInfo } from '../shared/runtime-diagnostics'
import type {
  WebsamDownloadProgress,
  WebsamModelFileUrls,
  WebsamModelStatus
} from '../shared/websam-models'

export interface AppAPI {
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<boolean>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    onMaximizedChange: (callback: (maximized: boolean) => void) => () => void
  }
  shell: {
    openExternal: (url: string) => Promise<void>
    openInApp: (url: string, title?: string) => Promise<void>
  }
  files: {
    openFolder: () => Promise<string | null>
    saveFolder: () => Promise<string | null>
    openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
    readDirectoryTree: (path: string) => Promise<import('../shared/types').FileEntry[]>
    readTextFile: (path: string) => Promise<string>
    readBinaryFile: (path: string) => Promise<ArrayBuffer>
    writeTextFile: (path: string, content: string) => Promise<number>
  }
  recent: {
    get: () => Promise<import('../shared/types').RecentProject[]>
    add: (path: string) => Promise<import('../shared/types').RecentProject[]>
    remove: (path: string) => Promise<import('../shared/types').RecentProject[]>
    exists: (path: string) => Promise<boolean>
  }
  paths: {
    formatDisplay: (path: string) => Promise<string>
  }
  runtime: {
    getInfo: () => Promise<RuntimeInfo>
  }
  gpu: {
    getFeatureStatus: () => Promise<GpuFeatureStatus>
    openChromeGpu: () => Promise<void>
  }
  project: {
    open: (rootPath: string) => Promise<{ rootPath: string } & ProjectSettings>
    close: () => Promise<void>
    update: (input: {
      name?: string
      segmentationMode?: SegmentationMode
    }) => Promise<ProjectSettings>
    getAnnotationStats: () => Promise<AnnotationStats>
    getWorkspaceSession: () => Promise<WorkspaceSession>
    setWorkspaceSession: (session: WorkspaceSession) => Promise<void>
  }
  labels: {
    list: () => Promise<Label[]>
    create: (input: CreateLabelInput) => Promise<Label>
    update: (input: UpdateLabelInput) => Promise<Label>
    delete: (id: string) => Promise<void>
    getDeleteStats: (id: string) => Promise<LabelDeleteStats>
  }
  images: {
    getOrCreate: (relativePath: string, width?: number, height?: number) => Promise<ImageRecord>
    setStatus: (relativePath: string, status: ImageStatus) => Promise<ImageRecord>
    listStatuses: () => Promise<Record<string, ImageStatus>>
  }
  shapes: {
    list: (relativePath: string) => Promise<Shape[]>
    replaceImage: (
      relativePath: string,
      rectangles: SaveRectangleInput[],
      masks: { input: SaveMaskInput; data: ArrayBuffer }[],
      polygons: SavePolygonInput[],
      imageWidth?: number,
      imageHeight?: number
    ) => Promise<Shape[]>
  }
  masks: {
    get: (shapeId: string) => Promise<MaskBlob | null>
  }
  semanticMasks: {
    get: (
      relativePath: string
    ) => Promise<{ width: number; height: number; data: ArrayBuffer } | null>
    save: (
      relativePath: string,
      width: number,
      height: number,
      classMap: ArrayBuffer
    ) => Promise<SemanticMaskBlob>
  }
  import: {
    yoloUltralyticsPreview: (options: YoloImportOptions) => Promise<YoloImportPreview>
    yoloUltralytics: (options: YoloImportOptions) => Promise<YoloImportResult>
  }
  export: {
    yoloUltralyticsPreview: (options: YoloExportOptions) => Promise<YoloExportPreview>
    yoloUltralytics: (options: YoloExportOptions) => Promise<YoloExportResult>
    cancelYoloUltralytics: () => Promise<void>
    onYoloUltralyticsProgress: (callback: (progress: YoloExportProgress) => void) => () => void
  }
  models: {
    listStatus: () => Promise<WebsamModelStatus[]>
    getFileUrls: (modelId: string) => Promise<WebsamModelFileUrls | null>
    download: (modelId: string) => Promise<{ ok: boolean; cancelled?: boolean }>
    cancelDownload: () => Promise<string | null>
    onDownloadProgress: (callback: (progress: WebsamDownloadProgress) => void) => () => void
  }
}

declare global {
  interface Window {
    api: AppAPI
  }
}

export {}
