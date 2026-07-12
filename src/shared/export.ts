export type YoloExportFormat = 'detection' | 'segmentation'

export type YoloExportContent = 'images_and_labels' | 'labels_only'

export interface YoloExportOptions {
  format: YoloExportFormat
  content: YoloExportContent
  outputDir: string
  includeClassesTxt: boolean
  convertToJpeg: boolean
  /** JPEG quality 50–100 in steps of 10 when convertToJpeg is enabled. */
  jpegQuality: number
}

export interface YoloExportProgress {
  completed: number
  total: number
}

export interface YoloExportResult {
  exportedImages: number
  exportedLabelFiles: number
  exportedShapes: number
  wroteClassesTxt: boolean
  warnings: string[]
  /** True when the user cancelled mid-export; partial files may remain. */
  cancelled: boolean
}

export interface YoloExportHooks {
  signal?: AbortSignal
  onProgress?: (progress: YoloExportProgress) => void
}

export interface YoloExportTreeNode {
  name: string
  type: 'directory' | 'file'
  children?: YoloExportTreeNode[]
  /** Present on directories when leaf files were truncated for display. */
  hiddenFileCount?: number
}

export interface YoloExportPreview {
  rootName: string
  imageCount: number
  labelFileCount: number
  shapeCount: number
  classCount: number
  includeClassesTxt: boolean
  convertToJpeg: boolean
  tree: YoloExportTreeNode
  warnings: string[]
}
