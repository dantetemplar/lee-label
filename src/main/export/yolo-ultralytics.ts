import { constants } from 'fs'
import { copyFile, mkdir, writeFile } from 'fs/promises'
import { availableParallelism } from 'os'
import { basename, dirname, extname, join } from 'path'
import type { Shape } from '../../shared/annotations'
import { IMAGE_EXTENSIONS } from '../../shared/file-types'
import type {
  YoloExportHooks,
  YoloExportOptions,
  YoloExportPreview,
  YoloExportResult
} from '../../shared/export'
import { projectDatabase } from '../db/project-db'
import type { ShapeRow } from '../db/types'
import { mapShape } from '../db/types'
import { readImageSize } from '../import/image-size'
import { buildExportFileTree } from './export-tree'
import { writeJpegCopy } from './jpeg-copy'
import { formatYoloDetectionLine, formatYoloSegmentationLine } from './yolo-format'

/** SSD-friendly copy concurrency; also used for mkdir / label writes. */
const EXPORT_IO_CONCURRENCY = Math.max(16, Math.min(32, availableParallelism() * 2))
/** Sharp is async via libuv — allow more than the old nativeImage sync path. */
const EXPORT_JPEG_CONCURRENCY = Math.max(4, Math.min(16, availableParallelism()))

interface ExportImageRow {
  id: number
  relative_path: string
  width: number | null
  height: number | null
}

function stemOf(filePath: string): string {
  return basename(filePath, extname(filePath))
}

/**
 * Map a project-relative image path to Ultralytics layout:
 *   images/<suffix>  +  labels/<suffix>.txt
 * Strips a leading `images/` so `images/a.jpg` → `images/a.jpg` + `labels/a.txt`
 * (not `images/images/a.jpg`).
 */
export function toYoloExportPaths(
  imageRelativePath: string,
  asJpeg: boolean
): { imageRel: string; labelRel: string } {
  let suffix = imageRelativePath.replace(/\\/g, '/')
  if (suffix.startsWith('images/')) {
    suffix = suffix.slice('images/'.length)
  }

  const dir = dirname(suffix)
  const stem = stemOf(suffix)
  const imageName = asJpeg ? `${stem}.jpg` : basename(suffix)
  const under = (root: string, fileName: string): string =>
    dir === '.' || dir === '' ? `${root}/${fileName}` : `${root}/${dir}/${fileName}`

  return {
    imageRel: under('images', imageName),
    labelRel: under('labels', `${stem}.txt`)
  }
}

function rectangleFromPolygon(points: { x: number; y: number }[]): {
  x: number
  y: number
  width: number
  height: number
} | null {
  if (points.length === 0) return null
  let minX = points[0]!.x
  let minY = points[0]!.y
  let maxX = points[0]!.x
  let maxY = points[0]!.y
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function shapeToYoloLine(
  shape: Shape,
  classIndex: number,
  format: YoloExportOptions['format'],
  imageWidth: number,
  imageHeight: number
): { line: string | null; warning?: string } {
  if (format === 'detection') {
    if (shape.type === 'rectangle') {
      return {
        line: formatYoloDetectionLine(
          classIndex,
          { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
          imageWidth,
          imageHeight
        )
      }
    }
    if (shape.type === 'polygon') {
      const rect = rectangleFromPolygon(shape.points)
      if (!rect) return { line: null, warning: 'Skipped empty polygon' }
      return { line: formatYoloDetectionLine(classIndex, rect, imageWidth, imageHeight) }
    }
    return {
      line: formatYoloDetectionLine(classIndex, shape.bounds, imageWidth, imageHeight),
      warning: 'Exported mask bounds as detection box'
    }
  }

  if (shape.type === 'polygon') {
    return {
      line: formatYoloSegmentationLine(classIndex, shape.points, imageWidth, imageHeight)
    }
  }
  if (shape.type === 'rectangle') {
    const points = [
      { x: shape.x, y: shape.y },
      { x: shape.x + shape.width, y: shape.y },
      { x: shape.x + shape.width, y: shape.y + shape.height },
      { x: shape.x, y: shape.y + shape.height }
    ]
    return { line: formatYoloSegmentationLine(classIndex, points, imageWidth, imageHeight) }
  }
  return { line: null, warning: 'Skipped mask shape in segmentation export' }
}

async function copyImageFile(sourcePath: string, destPath: string): Promise<void> {
  // Prefer copy-on-write when the FS supports it; Node falls back to a normal copy.
  await copyFile(sourcePath, destPath, constants.COPYFILE_FICLONE)
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  signal?: AbortSignal
): Promise<{ results: (R | undefined)[]; cancelled: boolean }> {
  const results = new Array<R | undefined>(items.length)
  let nextIndex = 0
  let cancelled = false

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      if (signal?.aborted) {
        cancelled = true
        return
      }
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index]!)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  await Promise.all(workers)
  if (signal?.aborted) cancelled = true
  return { results, cancelled }
}

function listExportImageRows(): ExportImageRow[] {
  return projectDatabase
    .requireDb()
    .prepare(
      `SELECT i.id, i.relative_path, i.width, i.height
       FROM images i
       WHERE i.status = 'done'
          OR EXISTS (SELECT 1 FROM shapes s WHERE s.image_id = i.id)
       ORDER BY i.relative_path ASC`
    )
    .all() as ExportImageRow[]
}

/** One query for all annotated shapes (+ polygon rings) instead of N+1. */
function loadShapesByImageId(): Map<number, Shape[]> {
  const rows = projectDatabase
    .requireDb()
    .prepare(
      `SELECT s.*, p.rings_json AS rings_json
       FROM shapes s
       LEFT JOIN polygon_data p ON p.shape_id = s.id
       ORDER BY s.image_id ASC, s.z_order ASC, s.created_at ASC`
    )
    .all() as (ShapeRow & { rings_json: string | null })[]

  const byImageId = new Map<number, Shape[]>()
  for (const row of rows) {
    let points: { x: number; y: number }[] | undefined
    if (row.type === 'polygon' && row.rings_json) {
      const rings = JSON.parse(row.rings_json) as { points: { x: number; y: number }[] }[]
      points = rings[0]?.points ?? []
    }
    const shape = mapShape(row, points)
    const list = byImageId.get(row.image_id)
    if (list) list.push(shape)
    else byImageId.set(row.image_id, [shape])
  }
  return byImageId
}

function countShapes(): number {
  const row = projectDatabase.requireDb().prepare('SELECT COUNT(*) AS count FROM shapes').get() as {
    count: number
  }
  return row.count
}

function planOutputPaths(options: YoloExportOptions): {
  rootName: string
  paths: string[]
  imageCount: number
  labelFileCount: number
  warnings: string[]
} {
  const imageRows = listExportImageRows()
  const warnings: string[] = []
  const paths: string[] = []
  let imageCount = 0
  let labelFileCount = 0

  if (options.includeClassesTxt) {
    paths.push('classes.txt')
  }

  for (const row of imageRows) {
    const relativePath = row.relative_path.replace(/\\/g, '/')
    const ext = extname(relativePath).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(ext)) {
      warnings.push(`Skipped non-image path ${relativePath}`)
      continue
    }

    const { imageRel, labelRel } = toYoloExportPaths(relativePath, options.convertToJpeg)
    paths.push(labelRel)
    labelFileCount += 1

    if (options.content === 'images_and_labels') {
      paths.push(imageRel)
      imageCount += 1
    }
  }

  return {
    rootName: basename(options.outputDir) || 'export',
    paths,
    imageCount,
    labelFileCount,
    warnings
  }
}

export function previewYoloUltralytics(options: YoloExportOptions): YoloExportPreview {
  if (!projectDatabase.getRootPath()) throw new Error('No project is open')

  const labels = projectDatabase.listLabels()
  const plan = planOutputPaths(options)

  return {
    rootName: plan.rootName,
    imageCount: plan.imageCount,
    labelFileCount: plan.labelFileCount,
    shapeCount: countShapes(),
    classCount: labels.length,
    includeClassesTxt: options.includeClassesTxt,
    convertToJpeg: options.content === 'images_and_labels' && options.convertToJpeg,
    tree: buildExportFileTree(plan.rootName, plan.paths),
    warnings: plan.warnings.slice(0, 20)
  }
}

export async function exportYoloUltralytics(
  options: YoloExportOptions,
  hooks: YoloExportHooks = {}
): Promise<YoloExportResult> {
  const projectRoot = projectDatabase.getRootPath()
  if (!projectRoot) throw new Error('No project is open')

  const labels = projectDatabase
    .listLabels()
    .slice()
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.classId - b.classId
    })
  const classIndexByLabelId = new Map(labels.map((label, index) => [label.id, index] as const))

  const imageRows = listExportImageRows()
  const shapesByImageId = loadShapesByImageId()

  const warnings: string[] = []
  let exportedImages = 0
  let exportedLabelFiles = 0
  let exportedShapes = 0
  let wroteClassesTxt = false

  if (hooks.signal?.aborted) {
    return {
      exportedImages: 0,
      exportedLabelFiles: 0,
      exportedShapes: 0,
      wroteClassesTxt: false,
      warnings: [],
      cancelled: true
    }
  }

  if (options.includeClassesTxt) {
    const classesContent = `${labels.map((label) => label.name).join('\n')}${labels.length > 0 ? '\n' : ''}`
    await writeFile(join(options.outputDir, 'classes.txt'), classesContent, 'utf8')
    wroteClassesTxt = true
  }

  type ExportJob = {
    relativePath: string
    absolutePath: string
    labelAbs: string
    labelBody: string
    imageAbs: string | null
    imageMode: 'copy' | 'jpeg'
    shapeCount: number
  }

  const jobs: ExportJob[] = []
  const dirsToCreate = new Set<string>()

  for (const row of imageRows) {
    if (hooks.signal?.aborted) break

    const relativePath = row.relative_path.replace(/\\/g, '/')
    const absolutePath = join(projectRoot, relativePath)
    const ext = extname(absolutePath).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(ext)) {
      warnings.push(`Skipped non-image path ${relativePath}`)
      continue
    }

    const shapes = shapesByImageId.get(row.id) ?? []
    const lines: string[] = []
    let shapeCount = 0

    if (shapes.length > 0) {
      let width = row.width ?? 0
      let height = row.height ?? 0
      if (!(width > 0) || !(height > 0)) {
        const size = readImageSize(absolutePath)
        if (!size) {
          warnings.push(`Could not read size for ${relativePath}`)
          continue
        }
        width = size.width
        height = size.height
      }

      for (const shape of shapes) {
        const classIndex = classIndexByLabelId.get(shape.labelId)
        if (classIndex === undefined) {
          warnings.push(`Missing label for shape on ${relativePath}`)
          continue
        }
        const converted = shapeToYoloLine(shape, classIndex, options.format, width, height)
        if (converted.warning) {
          warnings.push(`${relativePath}: ${converted.warning}`)
        }
        if (!converted.line) continue
        lines.push(converted.line)
        shapeCount += 1
      }
    }

    const { imageRel, labelRel } = toYoloExportPaths(relativePath, options.convertToJpeg)
    const labelAbs = join(options.outputDir, labelRel)
    dirsToCreate.add(dirname(labelAbs))

    let imageAbs: string | null = null
    let imageMode: 'copy' | 'jpeg' = 'copy'
    if (options.content === 'images_and_labels') {
      imageAbs = join(options.outputDir, imageRel)
      dirsToCreate.add(dirname(imageAbs))
      const alreadyJpeg = ext === '.jpg' || ext === '.jpeg'
      // Re-encode only when converting non-JPEG, or when quality remux is requested.
      imageMode =
        options.convertToJpeg && (!alreadyJpeg || options.jpegQuality < 100) ? 'jpeg' : 'copy'
    }

    jobs.push({
      relativePath,
      absolutePath,
      labelAbs,
      labelBody: `${lines.join('\n')}${lines.length > 0 ? '\n' : ''}`,
      imageAbs,
      imageMode,
      shapeCount
    })
  }

  if (hooks.signal?.aborted) {
    return {
      exportedImages: 0,
      exportedLabelFiles: 0,
      exportedShapes: 0,
      wroteClassesTxt,
      warnings: warnings.slice(0, 30),
      cancelled: true
    }
  }

  const total = jobs.length
  hooks.onProgress?.({ completed: 0, total })

  await mapPool(
    [...dirsToCreate],
    EXPORT_IO_CONCURRENCY,
    async (dir) => {
      await mkdir(dir, { recursive: true })
    },
    hooks.signal
  )

  if (hooks.signal?.aborted) {
    return {
      exportedImages: 0,
      exportedLabelFiles: 0,
      exportedShapes: 0,
      wroteClassesTxt,
      warnings: warnings.slice(0, 30),
      cancelled: true
    }
  }

  const needsJpeg = jobs.some((job) => job.imageAbs && job.imageMode === 'jpeg')
  const concurrency = needsJpeg ? EXPORT_JPEG_CONCURRENCY : EXPORT_IO_CONCURRENCY
  let completed = 0

  const { results, cancelled } = await mapPool(
    jobs,
    concurrency,
    async (job) => {
      await writeFile(job.labelAbs, job.labelBody, 'utf8')

      let imageOk = false
      let warning: string | null = null

      if (job.imageAbs) {
        try {
          if (job.imageMode === 'jpeg') {
            await writeJpegCopy(job.absolutePath, job.imageAbs, options.jpegQuality)
          } else {
            await copyImageFile(job.absolutePath, job.imageAbs)
          }
          imageOk = true
        } catch (error) {
          warning = `Failed to export image ${job.relativePath}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`
        }
      }

      completed += 1
      hooks.onProgress?.({ completed, total })
      return { imageOk, warning, shapeCount: job.shapeCount }
    },
    hooks.signal
  )

  for (const result of results) {
    if (!result) continue
    exportedLabelFiles += 1
    exportedShapes += result.shapeCount
    if (result.imageOk) exportedImages += 1
    if (result.warning) warnings.push(result.warning)
  }

  return {
    exportedImages,
    exportedLabelFiles,
    exportedShapes,
    wroteClassesTxt,
    warnings: warnings.slice(0, 30),
    cancelled
  }
}
