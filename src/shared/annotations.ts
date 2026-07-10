export type ImageStatus = 'todo' | 'in_progress' | 'done' | 'skipped'
export type MaskFormat = 'bitmap'

export interface Label {
  id: string
  name: string
  color: string
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

export type Shape = RectangleShape | MaskShape

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

// CVAT cvat-core/src/enums.ts
export const LABEL_COLORS = [
  '#33ddff',
  '#fa3253',
  '#34d1b7',
  '#ff007c',
  '#ff6037',
  '#ddff33',
  '#24b353',
  '#b83df5',
  '#66ff66',
  '#32b7fa',
  '#ffcc33',
  '#83e070',
  '#fafa37',
  '#5986b3',
  '#8c78f0',
  '#ff6a4d',
  '#f078f0',
  '#2a7dd1',
  '#b25050',
  '#cc3366',
  '#cc9933',
  '#aaf0d1',
  '#ff00cc',
  '#3df53d',
  '#fa32b7',
  '#fa7dbb',
  '#ff355e',
  '#f59331',
  '#3d3df5',
  '#733380'
] as const

export const SHAPE_OPACITY = 0.2
export const SELECTED_SHAPE_OPACITY = 0.5
