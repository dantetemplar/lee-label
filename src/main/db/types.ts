import type {
  ImageRecord,
  ImageStatus,
  Label,
  Shape
} from '../../shared/annotations'

export interface LabelRow {
  id: string
  name: string
  color: string
  class_id: number
  sort_order: number
  shortcut: string | null
}

export interface ImageRow {
  id: number
  relative_path: string
  width: number | null
  height: number | null
  status: ImageStatus
  updated_at: string | null
}

export interface ShapeRow {
  id: string
  image_id: number
  type: 'rectangle' | 'mask' | 'polygon'
  label_id: string
  z_order: number
  created_at: string
  updated_at: string
  x: number | null
  y: number | null
  width: number | null
  height: number | null
  bounds_x: number | null
  bounds_y: number | null
  bounds_width: number | null
  bounds_height: number | null
}

export function mapLabel(row: LabelRow): Label {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    classId: row.class_id,
    sortOrder: row.sort_order,
    shortcut: row.shortcut ?? undefined
  }
}

export function mapImage(row: ImageRow): ImageRecord {
  return {
    id: row.id,
    relativePath: row.relative_path,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    status: row.status,
    updatedAt: row.updated_at ?? undefined
  }
}

export function mapShape(row: ShapeRow, polygonPoints?: { x: number; y: number }[]): Shape {
  if (row.type === 'rectangle') {
    return {
      id: row.id,
      type: 'rectangle',
      labelId: row.label_id,
      zOrder: row.z_order,
      x: row.x ?? 0,
      y: row.y ?? 0,
      width: row.width ?? 0,
      height: row.height ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  if (row.type === 'polygon') {
    return {
      id: row.id,
      type: 'polygon',
      labelId: row.label_id,
      zOrder: row.z_order,
      points: polygonPoints ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  return {
    id: row.id,
    type: 'mask',
    labelId: row.label_id,
    zOrder: row.z_order,
    bounds: {
      x: row.bounds_x ?? 0,
      y: row.bounds_y ?? 0,
      width: row.bounds_width ?? 0,
      height: row.bounds_height ?? 0
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export interface DbContext {
  requireDb(): import('better-sqlite3').Database
  touchProject(): void
}
