export type ImageStatus = 'todo' | 'in_progress' | 'done' | 'skipped'
export type MaskFormat = 'bitmap'

export interface Label {
  id: string
  name: string
  color: string
  classId: number
  sortOrder: number
  shortcut?: string
}

export interface ImageRecord {
  id: number
  relativePath: string
  width?: number
  height?: number
  status: ImageStatus
  updatedAt?: string
  firstLabeledAt?: string | null
  doneAt?: string | null
  openedAt?: string | null
}

export interface RectangleShape {
  id: string
  type: 'rectangle'
  labelId: string
  zOrder: number
  x: number
  y: number
  width: number
  height: number
  createdAt: string
  updatedAt: string
}

export interface MaskShape {
  id: string
  type: 'mask'
  labelId: string
  zOrder: number
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  createdAt: string
  updatedAt: string
}

export interface PolygonShape {
  id: string
  type: 'polygon'
  labelId: string
  zOrder: number
  points: { x: number; y: number }[]
  createdAt: string
  updatedAt: string
}

export type Shape = RectangleShape | MaskShape | PolygonShape

export interface MaskBlob {
  width: number
  height: number
  format: MaskFormat
  data: ArrayBuffer
}

export interface SaveRectangleInput {
  id: string
  relativePath: string
  labelId: string
  zOrder: number
  x: number
  y: number
  width: number
  height: number
  imageWidth?: number
  imageHeight?: number
}

export interface SaveMaskInput {
  id: string
  relativePath: string
  labelId: string
  zOrder: number
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  imageWidth?: number
  imageHeight?: number
}

export interface SavePolygonInput {
  id: string
  relativePath: string
  labelId: string
  zOrder: number
  points: { x: number; y: number }[]
  imageWidth?: number
  imageHeight?: number
}

export type SemanticMaskFormat = 'png16'

export interface SemanticMaskBlob {
  width: number
  height: number
  format: SemanticMaskFormat
  data: ArrayBuffer
}

export interface AnnotationStats {
  shapeCount: number
  semanticMaskCount: number
}

export interface CreateLabelInput {
  name: string
  color?: string
  shortcut?: string
}

export interface UpdateLabelInput {
  id: string
  name: string
  color: string
  shortcut?: string
}

export interface LabelDeleteStats {
  fileCount: number
  instanceCount: number
}

/** Neon mask-overlay palette: fully saturated, high-contrast, evenly spaced hues. */
export const LABEL_COLORS = [
  '#ff004d',
  '#ff3b00',
  '#ff7700',
  '#ffb000',
  '#ffe600',
  '#b8ff00',
  '#70ff00',
  '#00ff2e',
  '#00ff7a',
  '#00ffc8',
  '#00e5ff',
  '#00a8ff',
  '#0066ff',
  '#2a00ff',
  '#6b00ff',
  '#a800ff',
  '#e000ff',
  '#ff00d4',
  '#ff0099',
  '#ff005c',
  '#ff4d6a',
  '#ff8c42',
  '#ffd60a',
  '#80ff00',
  '#00ffa3',
  '#00c2ff',
  '#4d7cff',
  '#c44dff',
  '#f15bb5',
  '#00f5d4'
] as const

export const SHAPE_OPACITY = 0.2
export const HOVERED_SHAPE_OPACITY = 0.35
export const SELECTED_SHAPE_OPACITY = 0.5
