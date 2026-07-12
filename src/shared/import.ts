export type YoloImportFormat = 'detection' | 'segmentation'

export interface YoloImportOptions {
  format: YoloImportFormat
  labelsDir: string
  classesPath?: string | null
  replaceExisting: boolean
  /** Optional classId → display name overrides from the preview step. */
  labelNames?: Record<number, string>
}

export interface YoloImportResult {
  matchedImages: number
  importedShapes: number
  createdLabels: number
  skippedLabelFiles: number
  missingImages: number
  warnings: string[]
}

export interface YoloPreviewLabel {
  classId: number
  name: string
  color: string
  shapeCount: number
  isNew: boolean
}

export interface YoloPreviewRectangle {
  type: 'rectangle'
  classId: number
  x: number
  y: number
  width: number
  height: number
}

export interface YoloPreviewPolygon {
  type: 'polygon'
  classId: number
  points: { x: number; y: number }[]
}

export type YoloPreviewShape = YoloPreviewRectangle | YoloPreviewPolygon

export interface YoloPreviewSample {
  relativePath: string
  absolutePath: string
  width: number
  height: number
  shapes: YoloPreviewShape[]
}

export interface YoloImportPreview {
  matchedImages: number
  imagesWithShapes: number
  totalShapes: number
  labelFileCount: number
  missingImages: number
  skippedLabelFiles: number
  newLabelCount: number
  existingLabelCount: number
  labels: YoloPreviewLabel[]
  samples: YoloPreviewSample[]
  warnings: string[]
}
