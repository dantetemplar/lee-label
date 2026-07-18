import type { ImageRecord, ImageStatus } from '../../shared/annotations'
import type { DbContext, ImageRow } from './types'
import { mapImage } from './types'

export class ImagesRepository {
  constructor(private readonly ctx: DbContext) {}

  getOrCreateImage(relativePath: string, width?: number, height?: number): ImageRecord {
    const db = this.ctx.requireDb()
    const existing = db
      .prepare('SELECT * FROM images WHERE relative_path = ?')
      .get(relativePath) as ImageRow | undefined

    if (existing) {
      if ((width !== undefined || height !== undefined) && (!existing.width || !existing.height)) {
        const now = new Date().toISOString()
        db.prepare(
          'UPDATE images SET width = COALESCE(?, width), height = COALESCE(?, height), updated_at = ? WHERE id = ?'
        ).run(width ?? null, height ?? null, now, existing.id)
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
      updatedAt: now,
      firstLabeledAt: null,
      doneAt: null,
      openedAt: null
    }
  }

  markImageOpened(relativePath: string): ImageRecord {
    const image = this.getOrCreateImage(relativePath)
    const now = new Date().toISOString()
    this.ctx.requireDb().prepare('UPDATE images SET opened_at = ? WHERE id = ?').run(now, image.id)
    return { ...image, openedAt: now }
  }

  setImageStatus(relativePath: string, status: ImageStatus): ImageRecord {
    const image = this.getOrCreateImage(relativePath)
    const now = new Date().toISOString()
    const firstLabeledAt =
      (status === 'in_progress' || status === 'done') && !image.firstLabeledAt
        ? now
        : (image.firstLabeledAt ?? null)
    const doneAt = status === 'done' ? now : null

    this.ctx
      .requireDb()
      .prepare(
        `UPDATE images SET
          status = ?,
          updated_at = ?,
          first_labeled_at = CASE
            WHEN first_labeled_at IS NULL AND ? IS NOT NULL THEN ?
            ELSE first_labeled_at
          END,
          done_at = ?
        WHERE id = ?`
      )
      .run(status, now, firstLabeledAt, firstLabeledAt, doneAt, image.id)
    this.ctx.touchProject()
    return {
      ...image,
      status,
      updatedAt: now,
      firstLabeledAt: image.firstLabeledAt ?? firstLabeledAt,
      doneAt
    }
  }

  listImageStatuses(): Record<string, ImageStatus> {
    const rows = this.ctx.requireDb().prepare('SELECT relative_path, status FROM images').all() as {
      relative_path: string
      status: ImageStatus
    }[]
    const result: Record<string, ImageStatus> = {}
    for (const row of rows) {
      result[row.relative_path] = row.status
    }
    return result
  }

  getImageMeta(relativePath: string): ImageRecord | null {
    const row = this.ctx
      .requireDb()
      .prepare('SELECT * FROM images WHERE relative_path = ?')
      .get(relativePath) as ImageRow | undefined
    return row ? mapImage(row) : null
  }

  getImageId(relativePath: string): number {
    return this.getOrCreateImage(relativePath).id
  }

  updateImageDimensions(imageId: number, imageWidth?: number, imageHeight?: number): void {
    if (imageWidth === undefined && imageHeight === undefined) return
    this.ctx
      .requireDb()
      .prepare(
        'UPDATE images SET width = COALESCE(?, width), height = COALESCE(?, height) WHERE id = ?'
      )
      .run(imageWidth ?? null, imageHeight ?? null, imageId)
  }
}
