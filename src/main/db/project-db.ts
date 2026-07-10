import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { basename } from 'path'
import type {
  CreateLabelInput,
  ImageRecord,
  ImageStatus,
  Label,
  MaskBlob,
  MaskShape,
  RectangleShape,
  SaveMaskInput,
  SaveRectangleInput,
  Shape,
  UpdateLabelInput
} from '../../shared/annotations'
import { getLabelColor } from '../../shared/label-color'
import { runMigrations } from './migrations'
import { getDbPath } from './paths'

interface LabelRow {
  id: string
  name: string
  color: string
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
  type: 'rectangle' | 'mask'
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

function mapShape(row: ShapeRow): Shape {
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
    const existingColors = (db.prepare('SELECT color FROM labels').all() as { color: string }[]).map(
      (row) => row.color
    )
    const id = randomUUID()
    const label: Label = {
      id,
      name: input.name,
      color: input.color?.trim() || getLabelColor(input.name, existingColors),
      sortOrder: maxOrder.max_order + 1,
      shortcut: input.shortcut
    }
    db.prepare(
      'INSERT INTO labels (id, name, color, sort_order, shortcut) VALUES (?, ?, ?, ?, ?)'
    ).run(label.id, label.name, label.color, label.sortOrder, label.shortcut ?? null)
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
    const usage = db.prepare('SELECT COUNT(*) AS count FROM shapes WHERE label_id = ?').get(id) as {
      count: number
    }
    if (usage.count > 0) {
      throw new Error('Cannot delete label that is used by annotations')
    }
    const result = db.prepare('DELETE FROM labels WHERE id = ?').run(id)
    if (result.changes === 0) throw new Error('Label not found')
    this.touchProject()
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
    return rows.map(mapShape)
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

  deleteShape(shapeId: string): void {
    const result = this.requireDb().prepare('DELETE FROM shapes WHERE id = ?').run(shapeId)
    if (result.changes === 0) throw new Error('Shape not found')
    this.touchProject()
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

    const keepIds = new Set([...rectangles.map((r) => r.id), ...masks.map((m) => m.input.id)])

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
    })

    tx()
    this.touchProject()
    return this.listShapes(relativePath)
  }

  private touchProject(): void {
    const now = new Date().toISOString()
    this.requireDb().prepare('UPDATE project SET updated_at = ? WHERE id = 1').run(now)
  }
}

export const projectDatabase = new ProjectDatabase()
