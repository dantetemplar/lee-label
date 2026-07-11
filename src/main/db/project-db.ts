import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { basename } from 'path'
import type {
  AnnotationStats,
  CreateLabelInput,
  ImageRecord,
  ImageStatus,
  Label,
  LabelDeleteStats,
  MaskBlob,
  MaskShape,
  PolygonShape,
  RectangleShape,
  SaveMaskInput,
  SavePolygonInput,
  SaveRectangleInput,
  SemanticMaskBlob,
  Shape,
  UpdateLabelInput
} from '../../shared/annotations'
import {
  DEFAULT_SEGMENTATION_MODE,
  type ProjectSettings,
  type SegmentationMode,
  SETTINGS_KEY_SEGMENTATION_MODE
} from '../../shared/segmentation'
import { encodeClassMap, decodeClassMap } from '../semantic-mask-codec'
import { getLabelColor } from '../../shared/label-color'
import { runMigrations } from './migrations'
import { getDbPath } from './paths'

interface LabelRow {
  id: string
  name: string
  color: string
  class_id: number
  sort_order: number
  shortcut: string | null
}

interface ImageRow {
  id: number
  relative_path: string
  width: number | null
  height: number | null
  status: ImageStatus
  updated_at: string | null
}

interface ShapeRow {
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

function mapLabel(row: LabelRow): Label {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    classId: row.class_id,
    sortOrder: row.sort_order,
    shortcut: row.shortcut ?? undefined
  }
}

function mapImage(row: ImageRow): ImageRecord {
  return {
    id: row.id,
    relativePath: row.relative_path,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    status: row.status,
    updatedAt: row.updated_at ?? undefined
  }
}

function mapShape(row: ShapeRow, polygonPoints?: { x: number; y: number }[]): Shape {
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

export class ProjectDatabase {
  private db: Database.Database | null = null
  private rootPath: string | null = null

  open(rootPath: string): void {
    this.close()
    const dbPath = getDbPath(rootPath)
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('synchronous = NORMAL')
    runMigrations(this.db)
    this.rootPath = rootPath

    const name = basename(rootPath)
    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE project SET name = COALESCE(name, ?), updated_at = ? WHERE id = 1')
      .run(name, now)
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.rootPath = null
    }
  }

  getRootPath(): string | null {
    return this.rootPath
  }

  getProject(): ProjectSettings {
    const db = this.requireDb()
    const row = db.prepare('SELECT name FROM project WHERE id = 1').get() as { name: string | null }
    const defaultName = basename(this.rootPath ?? '')
    return {
      name: row.name?.trim() || defaultName,
      segmentationMode: this.getSetting<SegmentationMode>(
        SETTINGS_KEY_SEGMENTATION_MODE,
        DEFAULT_SEGMENTATION_MODE
      )
    }
  }

  updateProject(input: {
    name?: string
    segmentationMode?: SegmentationMode
  }): ProjectSettings {
    const db = this.requireDb()
    const now = new Date().toISOString()

    if (input.name !== undefined) {
      const trimmed = input.name.trim()
      if (!trimmed) throw new Error('Project name cannot be empty')
      db.prepare('UPDATE project SET name = ?, updated_at = ? WHERE id = 1').run(trimmed, now)
    }

    if (input.segmentationMode !== undefined) {
      this.setSetting(SETTINGS_KEY_SEGMENTATION_MODE, input.segmentationMode)
    }

    this.touchProject()
    return this.getProject()
  }

  updateProjectName(name: string): { name: string } {
    const updated = this.updateProject({ name })
    return { name: updated.name }
  }

  getAnnotationStats(): AnnotationStats {
    const db = this.requireDb()
    const shapeCount = (
      db.prepare('SELECT COUNT(*) AS count FROM shapes').get() as { count: number }
    ).count
    const semanticMaskCount = (
      db.prepare('SELECT COUNT(*) AS count FROM semantic_masks').get() as { count: number }
    ).count
    return { shapeCount, semanticMaskCount }
  }

  private getSetting<T>(key: string, fallback: T): T {
    const row = this.requireDb()
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined
    if (!row) return fallback
    try {
      return JSON.parse(row.value) as T
    } catch {
      return row.value as T
    }
  }

  private setSetting(key: string, value: unknown): void {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    this.requireDb()
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, serialized)
  }

  private requireDb(): Database.Database {
    if (!this.db) throw new Error('No project database is open')
    return this.db
  }

  listLabels(): Label[] {
    const rows = this.requireDb()
      .prepare('SELECT * FROM labels ORDER BY sort_order ASC, name ASC')
      .all() as LabelRow[]
    return rows.map(mapLabel)
  }

  createLabel(input: CreateLabelInput): Label {
    const db = this.requireDb()
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM labels').get() as {
      max_order: number
    }
    const maxClassId = db.prepare('SELECT COALESCE(MAX(class_id), 0) AS max_class_id FROM labels').get() as {
      max_class_id: number
    }
    if (maxClassId.max_class_id >= 65535) {
      throw new Error('Maximum number of labels (65535) reached')
    }
    const existingColors = (db.prepare('SELECT color FROM labels').all() as { color: string }[]).map(
      (row) => row.color
    )
    const id = randomUUID()
    const label: Label = {
      id,
      name: input.name,
      color: input.color?.trim() || getLabelColor(input.name, existingColors),
      classId: maxClassId.max_class_id + 1,
      sortOrder: maxOrder.max_order + 1,
      shortcut: input.shortcut
    }
    db.prepare(
      'INSERT INTO labels (id, name, color, class_id, sort_order, shortcut) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(label.id, label.name, label.color, label.classId, label.sortOrder, label.shortcut ?? null)
    this.touchProject()
    return label
  }

  updateLabel(input: UpdateLabelInput): Label {
    const db = this.requireDb()
    const existing = db.prepare('SELECT * FROM labels WHERE id = ?').get(input.id) as LabelRow | undefined
    if (!existing) throw new Error('Label not found')

    db.prepare('UPDATE labels SET name = ?, color = ?, shortcut = ? WHERE id = ?').run(
      input.name,
      input.color,
      input.shortcut ?? null,
      input.id
    )
    this.touchProject()
    return mapLabel({ ...existing, name: input.name, color: input.color, shortcut: input.shortcut ?? null })
  }

  deleteLabel(id: string): void {
    const db = this.requireDb()
    const existing = db.prepare('SELECT id FROM labels WHERE id = ?').get(id) as { id: string } | undefined
    if (!existing) throw new Error('Label not found')

    const deleteShapes = db.prepare('DELETE FROM shapes WHERE label_id = ?')
    const deleteLabelRow = db.prepare('DELETE FROM labels WHERE id = ?')

    const tx = db.transaction(() => {
      deleteShapes.run(id)
      deleteLabelRow.run(id)
    })
    tx()
    this.touchProject()
  }

  getLabelDeleteStats(id: string): LabelDeleteStats {
    const db = this.requireDb()
    const existing = db.prepare('SELECT id FROM labels WHERE id = ?').get(id) as { id: string } | undefined
    if (!existing) throw new Error('Label not found')

    const row = db
      .prepare(
        `SELECT
          COUNT(*) AS instanceCount,
          COUNT(DISTINCT image_id) AS fileCount
        FROM shapes
        WHERE label_id = ?`
      )
      .get(id) as { instanceCount: number; fileCount: number }

    return {
      fileCount: row.fileCount,
      instanceCount: row.instanceCount
    }
  }

  getOrCreateImage(relativePath: string, width?: number, height?: number): ImageRecord {
    const db = this.requireDb()
    const existing = db
      .prepare('SELECT * FROM images WHERE relative_path = ?')
      .get(relativePath) as ImageRow | undefined

    if (existing) {
      if ((width !== undefined || height !== undefined) && (!existing.width || !existing.height)) {
        const now = new Date().toISOString()
        db.prepare('UPDATE images SET width = COALESCE(?, width), height = COALESCE(?, height), updated_at = ? WHERE id = ?').run(
          width ?? null,
          height ?? null,
          now,
          existing.id
        )
        return mapImage({
          ...existing,
          width: width ?? existing.width,
          height: height ?? existing.height,
          updated_at: now
        })
      }
      return mapImage(existing)
    }

    const now = new Date().toISOString()
    const result = db
      .prepare(
        'INSERT INTO images (relative_path, width, height, status, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(relativePath, width ?? null, height ?? null, 'todo', now)

    return {
      id: Number(result.lastInsertRowid),
      relativePath,
      width,
      height,
      status: 'todo',
      updatedAt: now
    }
  }

  setImageStatus(relativePath: string, status: ImageStatus): ImageRecord {
    const image = this.getOrCreateImage(relativePath)
    const now = new Date().toISOString()
    this.requireDb()
      .prepare('UPDATE images SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, image.id)
    this.touchProject()
    return { ...image, status, updatedAt: now }
  }

  listImageStatuses(): Record<string, ImageStatus> {
    const rows = this.requireDb()
      .prepare('SELECT relative_path, status FROM images')
      .all() as { relative_path: string; status: ImageStatus }[]
    const result: Record<string, ImageStatus> = {}
    for (const row of rows) {
      result[row.relative_path] = row.status
    }
    return result
  }

  private getImageId(relativePath: string): number {
    const image = this.getOrCreateImage(relativePath)
    return image.id
  }

  listShapes(relativePath: string): Shape[] {
    const imageId = this.getImageId(relativePath)
    const rows = this.requireDb()
      .prepare('SELECT * FROM shapes WHERE image_id = ? ORDER BY z_order ASC, created_at ASC')
      .all(imageId) as ShapeRow[]

    return rows.map((row) => {
      if (row.type !== 'polygon') return mapShape(row)
      const polygonRow = this.requireDb()
        .prepare('SELECT rings_json FROM polygon_data WHERE shape_id = ?')
        .get(row.id) as { rings_json: string } | undefined
      const rings = polygonRow ? (JSON.parse(polygonRow.rings_json) as { points: { x: number; y: number }[] }[]) : []
      return mapShape(row, rings[0]?.points ?? [])
    })
  }

  saveRectangle(input: SaveRectangleInput): RectangleShape {
    const db = this.requireDb()
    const imageId = this.getImageId(input.relativePath)
    if (input.imageWidth !== undefined || input.imageHeight !== undefined) {
      db.prepare('UPDATE images SET width = COALESCE(?, width), height = COALESCE(?, height) WHERE id = ?').run(
        input.imageWidth ?? null,
        input.imageHeight ?? null,
        imageId
      )
    }

    const now = new Date().toISOString()
    const existing = db.prepare('SELECT created_at FROM shapes WHERE id = ?').get(input.id) as
      | { created_at: string }
      | undefined
    const createdAt = existing?.created_at ?? now

    db.prepare(
      `INSERT INTO shapes (
        id, image_id, type, label_id, z_order, created_at, updated_at,
        x, y, width, height, bounds_x, bounds_y, bounds_width, bounds_height
      ) VALUES (?, ?, 'rectangle', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)
      ON CONFLICT(id) DO UPDATE SET
        label_id = excluded.label_id,
        z_order = excluded.z_order,
        updated_at = excluded.updated_at,
        x = excluded.x,
        y = excluded.y,
        width = excluded.width,
        height = excluded.height`
    ).run(
      input.id,
      imageId,
      input.labelId,
      input.zOrder,
      createdAt,
      now,
      input.x,
      input.y,
      input.width,
      input.height
    )

    this.touchProject()
    return {
      id: input.id,
      type: 'rectangle',
      labelId: input.labelId,
      zOrder: input.zOrder,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      createdAt,
      updatedAt: now
    }
  }

  savePolygon(input: SavePolygonInput): PolygonShape {
    const db = this.requireDb()
    const imageId = this.getImageId(input.relativePath)
    if (input.imageWidth !== undefined || input.imageHeight !== undefined) {
      db.prepare('UPDATE images SET width = COALESCE(?, width), height = COALESCE(?, height) WHERE id = ?').run(
        input.imageWidth ?? null,
        input.imageHeight ?? null,
        imageId
      )
    }

    if (input.points.length < 3) {
      throw new Error('Polygon must have at least 3 points')
    }

    const now = new Date().toISOString()
    const existing = db.prepare('SELECT created_at FROM shapes WHERE id = ?').get(input.id) as
      | { created_at: string }
      | undefined
    const createdAt = existing?.created_at ?? now
    const ringsJson = JSON.stringify([{ points: input.points }])

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO shapes (
          id, image_id, type, label_id, z_order, created_at, updated_at,
          x, y, width, height, bounds_x, bounds_y, bounds_width, bounds_height
        ) VALUES (?, ?, 'polygon', ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
        ON CONFLICT(id) DO UPDATE SET
          label_id = excluded.label_id,
          z_order = excluded.z_order,
          updated_at = excluded.updated_at`
      ).run(input.id, imageId, input.labelId, input.zOrder, createdAt, now)

      db.prepare(
        `INSERT INTO polygon_data (shape_id, rings_json)
         VALUES (?, ?)
         ON CONFLICT(shape_id) DO UPDATE SET rings_json = excluded.rings_json`
      ).run(input.id, ringsJson)
    })

    tx()
    this.touchProject()

    return {
      id: input.id,
      type: 'polygon',
      labelId: input.labelId,
      zOrder: input.zOrder,
      points: input.points,
      createdAt,
      updatedAt: now
    }
  }

  getPolygonPoints(shapeId: string): { x: number; y: number }[] | null {
    const row = this.requireDb()
      .prepare('SELECT rings_json FROM polygon_data WHERE shape_id = ?')
      .get(shapeId) as { rings_json: string } | undefined
    if (!row) return null
    const rings = JSON.parse(row.rings_json) as { points: { x: number; y: number }[] }[]
    return rings[0]?.points ?? null
  }

  saveMask(input: SaveMaskInput, data: Buffer): MaskShape {
    const db = this.requireDb()
    const imageId = this.getImageId(input.relativePath)
    if (input.imageWidth !== undefined || input.imageHeight !== undefined) {
      db.prepare('UPDATE images SET width = COALESCE(?, width), height = COALESCE(?, height) WHERE id = ?').run(
        input.imageWidth ?? null,
        input.imageHeight ?? null,
        imageId
      )
    }

    const now = new Date().toISOString()
    const existing = db.prepare('SELECT created_at FROM shapes WHERE id = ?').get(input.id) as
      | { created_at: string }
      | undefined
    const createdAt = existing?.created_at ?? now

    const width = Math.round(input.bounds.width)
    const height = Math.round(input.bounds.height)
    if (width <= 0 || height <= 0) {
      throw new Error('Mask bounds must be positive')
    }
    if (data.length !== width * height) {
      throw new Error(`Mask data length ${data.length} does not match ${width}x${height}`)
    }

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO shapes (
          id, image_id, type, label_id, z_order, created_at, updated_at,
          x, y, width, height, bounds_x, bounds_y, bounds_width, bounds_height
        ) VALUES (?, ?, 'mask', ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label_id = excluded.label_id,
          z_order = excluded.z_order,
          updated_at = excluded.updated_at,
          bounds_x = excluded.bounds_x,
          bounds_y = excluded.bounds_y,
          bounds_width = excluded.bounds_width,
          bounds_height = excluded.bounds_height`
      ).run(
        input.id,
        imageId,
        input.labelId,
        input.zOrder,
        createdAt,
        now,
        input.bounds.x,
        input.bounds.y,
        input.bounds.width,
        input.bounds.height
      )

      db.prepare(
        `INSERT INTO mask_data (shape_id, width, height, format, data)
         VALUES (?, ?, ?, 'bitmap', ?)
         ON CONFLICT(shape_id) DO UPDATE SET
           width = excluded.width,
           height = excluded.height,
           format = excluded.format,
           data = excluded.data`
      ).run(input.id, width, height, data)
    })

    tx()
    this.touchProject()

    return {
      id: input.id,
      type: 'mask',
      labelId: input.labelId,
      zOrder: input.zOrder,
      bounds: input.bounds,
      createdAt,
      updatedAt: now
    }
  }

  getMaskBlob(shapeId: string): MaskBlob | null {
    const row = this.requireDb()
      .prepare('SELECT width, height, format, data FROM mask_data WHERE shape_id = ?')
      .get(shapeId) as
      | { width: number; height: number; format: 'bitmap'; data: Buffer }
      | undefined
    if (!row) return null

    const buffer = row.data
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer

    return {
      width: row.width,
      height: row.height,
      format: row.format,
      data: arrayBuffer
    }
  }

  replaceImageShapes(
    relativePath: string,
    rectangles: SaveRectangleInput[],
    masks: { input: SaveMaskInput; data: Buffer }[],
    polygons: SavePolygonInput[],
    imageWidth?: number,
    imageHeight?: number
  ): Shape[] {
    const db = this.requireDb()
    const imageId = this.getImageId(relativePath)

    if (imageWidth !== undefined || imageHeight !== undefined) {
      db.prepare('UPDATE images SET width = COALESCE(?, width), height = COALESCE(?, height) WHERE id = ?').run(
        imageWidth ?? null,
        imageHeight ?? null,
        imageId
      )
    }

    const keepIds = new Set([
      ...rectangles.map((r) => r.id),
      ...masks.map((m) => m.input.id),
      ...polygons.map((p) => p.id)
    ])

    const tx = db.transaction(() => {
      const existing = db
        .prepare('SELECT id FROM shapes WHERE image_id = ?')
        .all(imageId) as { id: string }[]
      for (const row of existing) {
        if (!keepIds.has(row.id)) {
          db.prepare('DELETE FROM shapes WHERE id = ?').run(row.id)
        }
      }

      for (const rect of rectangles) {
        this.saveRectangle({ ...rect, relativePath, imageWidth, imageHeight })
      }
      for (const mask of masks) {
        this.saveMask({ ...mask.input, relativePath, imageWidth, imageHeight }, mask.data)
      }
      for (const polygon of polygons) {
        this.savePolygon({ ...polygon, relativePath, imageWidth, imageHeight })
      }
    })

    tx()
    this.touchProject()
    return this.listShapes(relativePath)
  }

  getSemanticMask(relativePath: string): SemanticMaskBlob | null {
    const imageId = this.getImageId(relativePath)
    const row = this.requireDb()
      .prepare('SELECT width, height, format, data FROM semantic_masks WHERE image_id = ?')
      .get(imageId) as
      | { width: number; height: number; format: 'png16'; data: Buffer }
      | undefined
    if (!row) return null

    const buffer = row.data
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer

    return {
      width: row.width,
      height: row.height,
      format: row.format,
      data: arrayBuffer
    }
  }

  saveSemanticMask(
    relativePath: string,
    width: number,
    height: number,
    classMap: Uint16Array
  ): SemanticMaskBlob {
    const imageId = this.getImageId(relativePath)
    const pngBuffer = encodeClassMap(classMap, width, height)

    this.requireDb()
      .prepare(
        `INSERT INTO semantic_masks (image_id, width, height, format, data)
         VALUES (?, ?, ?, 'png16', ?)
         ON CONFLICT(image_id) DO UPDATE SET
           width = excluded.width,
           height = excluded.height,
           format = excluded.format,
           data = excluded.data`
      )
      .run(imageId, width, height, pngBuffer)

    this.touchProject()

    const arrayBuffer = pngBuffer.buffer.slice(
      pngBuffer.byteOffset,
      pngBuffer.byteOffset + pngBuffer.byteLength
    ) as ArrayBuffer

    return {
      width,
      height,
      format: 'png16',
      data: arrayBuffer
    }
  }

  decodeSemanticMask(blob: SemanticMaskBlob): Uint16Array {
    const buffer = Buffer.from(blob.data)
    return decodeClassMap(buffer).data
  }

  private touchProject(): void {
    const now = new Date().toISOString()
    this.requireDb().prepare('UPDATE project SET updated_at = ? WHERE id = 1').run(now)
  }
}

export const projectDatabase = new ProjectDatabase()
