import type {
  MaskBlob,
  MaskShape,
  PolygonShape,
  RectangleShape,
  SaveMaskInput,
  SavePolygonInput,
  SaveRectangleInput,
  Shape
} from '../../shared/annotations'
import type { DbContext, ShapeRow } from './types'
import { mapShape } from './types'
import type { ImagesRepository } from './images'

function saveRectangle(
  ctx: DbContext,
  images: ImagesRepository,
  input: SaveRectangleInput
): RectangleShape {
  const db = ctx.requireDb()
  const imageId = images.getImageId(input.relativePath)
  images.updateImageDimensions(imageId, input.imageWidth, input.imageHeight)

  const now = new Date().toISOString()
  const existing = db.prepare('SELECT created_at FROM shapes WHERE id = ?').get(input.id) as
    { created_at: string } | undefined
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

  ctx.touchProject()
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

function savePolygon(
  ctx: DbContext,
  images: ImagesRepository,
  input: SavePolygonInput
): PolygonShape {
  const db = ctx.requireDb()
  const imageId = images.getImageId(input.relativePath)
  images.updateImageDimensions(imageId, input.imageWidth, input.imageHeight)

  if (input.points.length < 3) {
    throw new Error('Polygon must have at least 3 points')
  }

  const now = new Date().toISOString()
  const existing = db.prepare('SELECT created_at FROM shapes WHERE id = ?').get(input.id) as
    { created_at: string } | undefined
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
  ctx.touchProject()

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

function saveMask(
  ctx: DbContext,
  images: ImagesRepository,
  input: SaveMaskInput,
  data: Buffer
): MaskShape {
  const db = ctx.requireDb()
  const imageId = images.getImageId(input.relativePath)
  images.updateImageDimensions(imageId, input.imageWidth, input.imageHeight)

  const now = new Date().toISOString()
  const existing = db.prepare('SELECT created_at FROM shapes WHERE id = ?').get(input.id) as
    { created_at: string } | undefined
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
  ctx.touchProject()

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

export class ShapesRepository {
  constructor(
    private readonly ctx: DbContext,
    private readonly images: ImagesRepository
  ) {}

  listShapes(relativePath: string): Shape[] {
    const imageId = this.images.getImageId(relativePath)
    const rows = this.ctx
      .requireDb()
      .prepare('SELECT * FROM shapes WHERE image_id = ? ORDER BY z_order ASC, created_at ASC')
      .all(imageId) as ShapeRow[]

    return rows.map((row) => {
      if (row.type !== 'polygon') return mapShape(row)
      const polygonRow = this.ctx
        .requireDb()
        .prepare('SELECT rings_json FROM polygon_data WHERE shape_id = ?')
        .get(row.id) as { rings_json: string } | undefined
      const rings = polygonRow
        ? (JSON.parse(polygonRow.rings_json) as { points: { x: number; y: number }[] }[])
        : []
      return mapShape(row, rings[0]?.points ?? [])
    })
  }

  getMaskBlob(shapeId: string): MaskBlob | null {
    const row = this.ctx
      .requireDb()
      .prepare('SELECT width, height, format, data FROM mask_data WHERE shape_id = ?')
      .get(shapeId) as { width: number; height: number; format: 'bitmap'; data: Buffer } | undefined
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
    const db = this.ctx.requireDb()
    const imageId = this.images.getImageId(relativePath)
    this.images.updateImageDimensions(imageId, imageWidth, imageHeight)

    const keepIds = new Set([
      ...rectangles.map((r) => r.id),
      ...masks.map((m) => m.input.id),
      ...polygons.map((p) => p.id)
    ])

    const tx = db.transaction(() => {
      const existing = db.prepare('SELECT id FROM shapes WHERE image_id = ?').all(imageId) as {
        id: string
      }[]
      for (const row of existing) {
        if (!keepIds.has(row.id)) {
          db.prepare('DELETE FROM shapes WHERE id = ?').run(row.id)
        }
      }

      for (const rect of rectangles) {
        saveRectangle(this.ctx, this.images, { ...rect, relativePath, imageWidth, imageHeight })
      }
      for (const mask of masks) {
        saveMask(
          this.ctx,
          this.images,
          { ...mask.input, relativePath, imageWidth, imageHeight },
          mask.data
        )
      }
      for (const polygon of polygons) {
        savePolygon(this.ctx, this.images, { ...polygon, relativePath, imageWidth, imageHeight })
      }
    })

    tx()
    this.ctx.touchProject()
    return this.listShapes(relativePath)
  }
}
