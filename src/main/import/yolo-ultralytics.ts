import { randomUUID } from 'crypto'
import { readdir, readFile, stat } from 'fs/promises'
import { basename, extname, join, relative } from 'path'
import type {
  Label,
  SavePolygonInput,
  SaveRectangleInput,
  Shape
} from '../../shared/annotations'
import { IMAGE_EXTENSIONS } from '../../shared/file-types'
import type {
  YoloImportOptions,
  YoloImportPreview,
  YoloImportResult,
  YoloPreviewLabel,
  YoloPreviewSample,
  YoloPreviewShape
} from '../../shared/import'
import { getLabelColor } from '../../shared/label-color'
import { projectDatabase } from '../db/project-db'
import { readImageSize } from './image-size'
import {
  parseClassNames,
  parseYoloDetectionLine,
  parseYoloSegmentationLine
} from './yolo-parse'

const PREVIEW_SAMPLE_LIMIT = 24
const SCAN_CONCURRENCY = 32

interface ProjectImage {
  relativePath: string
  absolutePath: string
  stem: string
}

interface ParsedImageImport {
  relativePath: string
  absolutePath: string
  width: number
  height: number
  shapes: YoloPreviewShape[]
}

export interface ImportScan {
  images: ParsedImageImport[]
  labels: YoloPreviewLabel[]
  warnings: string[]
  labelFileCount: number
  missingImages: number
  skippedLabelFiles: number
}

interface ScanCacheEntry {
  key: string
  projectRoot: string
  scan: ImportScan
}

let scanCache: ScanCacheEntry | null = null

function optionsCacheKey(options: YoloImportOptions, projectRoot: string): string {
  return JSON.stringify({
    projectRoot,
    format: options.format,
    labelsDir: options.labelsDir,
    classesPath: options.classesPath ?? null,
    replaceExisting: options.replaceExisting
  })
}

function clearScanCache(): void {
  scanCache = null
}

async function collectFilesRecursive(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '.lee-label' || entry.name === 'node_modules' || entry.name === '.git') {
        continue
      }
      files.push(...(await collectFilesRecursive(fullPath)))
      continue
    }
    if (entry.isFile()) files.push(fullPath)
  }
  return files
}

function stemOf(filePath: string): string {
  return basename(filePath, extname(filePath))
}

async function indexProjectImages(projectRoot: string): Promise<Map<string, ProjectImage[]>> {
  const files = await collectFilesRecursive(projectRoot)
  const byStem = new Map<string, ProjectImage[]>()

  for (const absolutePath of files) {
    const ext = extname(absolutePath).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(ext)) continue
    const relativePath = relative(projectRoot, absolutePath).replace(/\\/g, '/')
    const stem = stemOf(absolutePath).toLowerCase()
    const image: ProjectImage = { relativePath, absolutePath, stem }
    const list = byStem.get(stem) ?? []
    list.push(image)
    byStem.set(stem, list)
  }

  return byStem
}

function pickImageCandidate(
  candidates: ProjectImage[],
  labelFile: string,
  labelsDir: string,
  warnings: string[]
): ProjectImage {
  if (candidates.length === 1) return candidates[0]!

  const labelRel = relative(labelsDir, labelFile).replace(/\\/g, '/')
  const labelParent = labelRel.includes('/') ? labelRel.slice(0, labelRel.lastIndexOf('/')) : ''
  const preferred = candidates.find((candidate) => {
    const imageParent = candidate.relativePath.includes('/')
      ? candidate.relativePath.slice(0, candidate.relativePath.lastIndexOf('/'))
      : ''
    return (
      imageParent === labelParent ||
      imageParent.endsWith(`/${labelParent}`) ||
      imageParent.endsWith(labelParent)
    )
  })
  const image = preferred ?? candidates[0]!
  if (!preferred) {
    warnings.push(`Multiple images match "${stemOf(labelFile)}"; using ${image.relativePath}`)
  }
  return image
}

function resolvePreviewLabel(
  classId: number,
  classNames: string[],
  existingByName: Map<string, Label>,
  labelCache: Map<number, YoloPreviewLabel>,
  usedColors: string[]
): YoloPreviewLabel {
  const cached = labelCache.get(classId)
  if (cached) return cached

  const name = (classNames[classId] ?? `class_${classId}`).trim() || `class_${classId}`
  const existing = existingByName.get(name.toLowerCase())
  const label: YoloPreviewLabel = existing
    ? {
        classId,
        name: existing.name,
        color: existing.color,
        shapeCount: 0,
        isNew: false
      }
    : {
        classId,
        name,
        color: getLabelColor(name, usedColors),
        shapeCount: 0,
        isNew: true
      }

  if (label.isNew) usedColors.push(label.color)
  labelCache.set(classId, label)
  return label
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index]!, index)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  await Promise.all(workers)
  return results
}

async function scanYoloImport(options: YoloImportOptions): Promise<ImportScan> {
  const projectRoot = projectDatabase.getRootPath()
  if (!projectRoot) throw new Error('No project is open')

  const cacheKey = optionsCacheKey(options, projectRoot)
  if (scanCache && scanCache.key === cacheKey && scanCache.projectRoot === projectRoot) {
    return scanCache.scan
  }

  const labelsDirStat = await stat(options.labelsDir)
  if (!labelsDirStat.isDirectory()) {
    throw new Error('Labels path must be a directory')
  }

  const warnings: string[] = []
  let classNames: string[] = []

  if (options.classesPath) {
    const classesContent = await readFile(options.classesPath, 'utf8')
    classNames = parseClassNames(classesContent, options.classesPath)
    if (classNames.length === 0) {
      warnings.push('Could not parse class names from the selected classes file')
    }
  }

  const projectImages = await indexProjectImages(projectRoot)
  const labelFiles = (await collectFilesRecursive(options.labelsDir)).filter(
    (filePath) => extname(filePath).toLowerCase() === '.txt'
  )

  const existingByName = new Map(
    projectDatabase.listLabels().map((label) => [label.name.toLowerCase(), label] as const)
  )
  const usedColors = [...existingByName.values()].map((label) => label.color)
  const labelCache = new Map<number, YoloPreviewLabel>()
  const sizeCache = new Map<string, { width: number; height: number } | null>()

  let missingImages = 0
  let skippedLabelFiles = 0

  type FileResult =
    | { kind: 'missing' }
    | { kind: 'skipped'; warning: string }
    | { kind: 'ok'; image: ParsedImageImport; warning?: string }

  const fileResults = await mapPool(labelFiles, SCAN_CONCURRENCY, async (labelFile) => {
    const stem = stemOf(labelFile).toLowerCase()
    const candidates = projectImages.get(stem) ?? []
    if (candidates.length === 0) return { kind: 'missing' } satisfies FileResult

    const localWarnings: string[] = []
    const image = pickImageCandidate(candidates, labelFile, options.labelsDir, localWarnings)

    let size = sizeCache.get(image.absolutePath)
    if (size === undefined) {
      size = readImageSize(image.absolutePath)
      sizeCache.set(image.absolutePath, size)
    }
    if (!size) {
      return {
        kind: 'skipped',
        warning: `Could not read image size for ${image.relativePath}`
      } satisfies FileResult
    }

    const content = await readFile(labelFile, 'utf8')
    const lines = content.split(/\r?\n/)
    const shapes: YoloPreviewShape[] = []
    let parseErrors = 0

    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith('#')) continue

      if (options.format === 'detection') {
        const box = parseYoloDetectionLine(line, size.width, size.height)
        if (!box) {
          parseErrors += 1
          continue
        }
        shapes.push({
          type: 'rectangle',
          classId: box.classId,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height
        })
        continue
      }

      const polygon = parseYoloSegmentationLine(line, size.width, size.height)
      if (!polygon) {
        parseErrors += 1
        continue
      }
      shapes.push({
        type: 'polygon',
        classId: polygon.classId,
        points: polygon.points
      })
    }

    return {
      kind: 'ok',
      image: {
        relativePath: image.relativePath,
        absolutePath: image.absolutePath,
        width: size.width,
        height: size.height,
        shapes
      },
      warning:
        parseErrors > 0
          ? `${basename(labelFile)}: skipped ${parseErrors} invalid line(s)`
          : localWarnings[0]
    } satisfies FileResult
  })

  const images: ParsedImageImport[] = []
  for (const result of fileResults) {
    if (result.kind === 'missing') {
      missingImages += 1
      continue
    }
    if (result.kind === 'skipped') {
      skippedLabelFiles += 1
      warnings.push(result.warning)
      continue
    }

    for (const shape of result.image.shapes) {
      const label = resolvePreviewLabel(
        shape.classId,
        classNames,
        existingByName,
        labelCache,
        usedColors
      )
      label.shapeCount += 1
    }

    if (result.warning) warnings.push(result.warning)
    images.push(result.image)
  }

  const labels = [...labelCache.values()].sort((a, b) => a.classId - b.classId)
  const scan: ImportScan = {
    images,
    labels,
    warnings: warnings.slice(0, 40),
    labelFileCount: labelFiles.length,
    missingImages,
    skippedLabelFiles
  }

  scanCache = { key: cacheKey, projectRoot, scan }
  return scan
}

function shapesToSaveInputs(
  shapes: Shape[],
  relativePath: string,
  imageWidth: number,
  imageHeight: number
): {
  rectangles: SaveRectangleInput[]
  polygons: SavePolygonInput[]
} {
  const rectangles: SaveRectangleInput[] = []
  const polygons: SavePolygonInput[] = []

  for (const shape of shapes) {
    if (shape.type === 'rectangle') {
      rectangles.push({
        id: shape.id,
        relativePath,
        labelId: shape.labelId,
        zOrder: shape.zOrder,
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        imageWidth,
        imageHeight
      })
      continue
    }
    if (shape.type === 'polygon') {
      polygons.push({
        id: shape.id,
        relativePath,
        labelId: shape.labelId,
        zOrder: shape.zOrder,
        points: shape.points,
        imageWidth,
        imageHeight
      })
    }
  }

  return { rectangles, polygons }
}

function ensureLabelForPreview(
  previewLabel: YoloPreviewLabel,
  labelsByName: Map<string, Label>,
  createdLabelIds: Set<string>
): Label {
  const existing = labelsByName.get(previewLabel.name.toLowerCase())
  if (existing) return existing

  const created = projectDatabase.createLabel({
    name: previewLabel.name,
    color: previewLabel.color
  })
  labelsByName.set(created.name.toLowerCase(), created)
  createdLabelIds.add(created.id)
  return created
}

function applyLabelNames(
  labels: YoloPreviewLabel[],
  labelNames: Record<number, string> | undefined,
  existingByName: Map<string, Label>
): YoloPreviewLabel[] {
  if (!labelNames) return labels
  return labels.map((label) => {
    const renamed = labelNames[label.classId]?.trim()
    if (!renamed || renamed === label.name) return label
    const existing = existingByName.get(renamed.toLowerCase())
    return {
      ...label,
      name: existing?.name ?? renamed,
      color: existing?.color ?? label.color,
      isNew: !existing
    }
  })
}

export async function previewYoloUltralytics(
  options: YoloImportOptions
): Promise<YoloImportPreview> {
  const scan = await scanYoloImport(options)
  const samples: YoloPreviewSample[] = scan.images
    .filter((image) => image.shapes.length > 0)
    .slice(0, PREVIEW_SAMPLE_LIMIT)
    .map((image) => ({
      relativePath: image.relativePath,
      absolutePath: image.absolutePath,
      width: image.width,
      height: image.height,
      shapes: image.shapes
    }))

  const imagesWithShapes = scan.images.filter((image) => image.shapes.length > 0).length
  const totalShapes = scan.labels.reduce((sum, label) => sum + label.shapeCount, 0)
  const newLabelCount = scan.labels.filter((label) => label.isNew).length

  return {
    matchedImages: scan.images.length,
    imagesWithShapes,
    totalShapes,
    labelFileCount: scan.labelFileCount,
    missingImages: scan.missingImages,
    skippedLabelFiles: scan.skippedLabelFiles,
    newLabelCount,
    existingLabelCount: scan.labels.length - newLabelCount,
    labels: scan.labels,
    samples,
    warnings: scan.warnings.slice(0, 20)
  }
}

export async function importYoloUltralytics(
  options: YoloImportOptions
): Promise<YoloImportResult> {
  const scan = await scanYoloImport(options)
  const labelsByName = new Map(
    projectDatabase.listLabels().map((label) => [label.name.toLowerCase(), label] as const)
  )
  const labels = applyLabelNames(scan.labels, options.labelNames, labelsByName)
  const createdLabelIds = new Set<string>()
  const labelIdByClass = new Map<number, string>()

  for (const previewLabel of labels) {
    const label = ensureLabelForPreview(previewLabel, labelsByName, createdLabelIds)
    labelIdByClass.set(previewLabel.classId, label.id)
  }

  const statuses = projectDatabase.listImageStatuses()
  const pathsToMarkInProgress: string[] = []
  let importedShapes = 0

  const db = projectDatabase.requireDb()
  const writeAll = db.transaction(() => {
    for (const image of scan.images) {
      const rectangles: SaveRectangleInput[] = []
      const polygons: SavePolygonInput[] = []
      let zOrder = 0

      for (const shape of image.shapes) {
        const labelId = labelIdByClass.get(shape.classId)
        if (!labelId) continue

        if (shape.type === 'rectangle') {
          rectangles.push({
            id: randomUUID(),
            relativePath: image.relativePath,
            labelId,
            zOrder: zOrder++,
            x: shape.x,
            y: shape.y,
            width: shape.width,
            height: shape.height,
            imageWidth: image.width,
            imageHeight: image.height
          })
          continue
        }

        polygons.push({
          id: randomUUID(),
          relativePath: image.relativePath,
          labelId,
          zOrder: zOrder++,
          points: shape.points,
          imageWidth: image.width,
          imageHeight: image.height
        })
      }

      let finalRectangles = rectangles
      let finalPolygons = polygons

      if (!options.replaceExisting) {
        const existing = projectDatabase.listShapes(image.relativePath)
        const kept = shapesToSaveInputs(existing, image.relativePath, image.width, image.height)
        const baseZ =
          Math.max(
            0,
            ...kept.rectangles.map((rect) => rect.zOrder),
            ...kept.polygons.map((poly) => poly.zOrder),
            -1
          ) + 1
        finalRectangles = [
          ...kept.rectangles,
          ...rectangles.map((rect, index) => ({ ...rect, zOrder: baseZ + index }))
        ]
        finalPolygons = [
          ...kept.polygons,
          ...polygons.map((poly, index) => ({
            ...poly,
            zOrder: baseZ + rectangles.length + index
          }))
        ]
      }

      projectDatabase.replaceImageShapes(
        image.relativePath,
        finalRectangles,
        [],
        finalPolygons,
        image.width,
        image.height
      )

      if (
        finalRectangles.length + finalPolygons.length > 0 &&
        (statuses[image.relativePath] ?? 'todo') === 'todo'
      ) {
        pathsToMarkInProgress.push(image.relativePath)
      }

      importedShapes += rectangles.length + polygons.length
    }

    const now = new Date().toISOString()
    const updateStatus = db.prepare(
      `UPDATE images SET status = 'in_progress', updated_at = ? WHERE relative_path = ? AND status = 'todo'`
    )
    for (const relativePath of pathsToMarkInProgress) {
      updateStatus.run(now, relativePath)
    }
  })

  writeAll()
  clearScanCache()

  return {
    matchedImages: scan.images.length,
    importedShapes,
    createdLabels: createdLabelIds.size,
    skippedLabelFiles: scan.skippedLabelFiles,
    missingImages: scan.missingImages,
    warnings: scan.warnings.slice(0, 20)
  }
}
