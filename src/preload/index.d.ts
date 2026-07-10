import type {
  CreateLabelInput,
  ImageRecord,
  ImageStatus,
  Label,
  LabelDeleteStats,
  MaskBlob,
  SaveMaskInput,
  SaveRectangleInput,
  Shape,
  UpdateLabelInput
} from '../shared/annotations'

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
    readDirectoryTree: (path: string) => Promise<import('../shared/types').FileEntry[]>
    readTextFile: (path: string) => Promise<string>
    writeTextFile: (path: string, content: string) => Promise<number>
  }
  recent: {
    get: () => Promise<import('../shared/types').RecentProject[]>
    add: (path: string) => Promise<import('../shared/types').RecentProject[]>
    exists: (path: string) => Promise<boolean>
  }
  project: {
    open: (rootPath: string) => Promise<{ rootPath: string }>
    close: () => Promise<void>
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
      imageWidth?: number,
      imageHeight?: number
    ) => Promise<Shape[]>
  }
  masks: {
    get: (shapeId: string) => Promise<MaskBlob | null>
  }
}

declare global {
  interface Window {
    api: AppAPI
  }
}

export {}
