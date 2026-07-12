export type YoloImportFormat = 'detection' | 'segmentation'

/** Status applied to matched images that have shapes. */
export type YoloMatchedStatus = 'in_progress' | 'done'

/** Status action for matched empty label files. */
export type YoloEmptyMatchedAction = 'leave' | 'in_progress' | 'done'

/** What to do with project images that have no matching label file. */
export type YoloUnmatchedAction = 'leave' | 'done' | 'skipped'

export interface YoloImportOptions {
  format: YoloImportFormat
  labelsDir: string
  classesPath?: string | null
  replaceExisting: boolean
  matchedStatus: YoloMatchedStatus
  emptyMatchedAction: YoloEmptyMatchedAction
  unmatchedAction: YoloUnmatchedAction
  /** Optional classId → display name overrides from the preview step. */
  labelNames?: Record<number, string>
}

export interface YoloImportResult {
  matchedImages: number
  importedShapes: number
  createdLabels: number
  skippedLabelFiles: number
  missingImages: number
  unmatchedImages: number
  unmatchedUpdated: number
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
  unmatchedImages: number
  skippedLabelFiles: number
  newLabelCount: number
  existingLabelCount: number
  labels: YoloPreviewLabel[]
  samples: YoloPreviewSample[]
  warnings: string[]
}
