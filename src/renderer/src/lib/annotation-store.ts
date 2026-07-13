import { createSignal } from 'solid-js'
import { randomUUID } from '../../../shared/uuid'
import type {
  ImageStatus,
  MaskShape,
  PolygonShape,
  RectangleShape,
  SaveMaskInput,
  SavePolygonInput,
  SaveRectangleInput
} from '../../../shared/annotations'
import type { SegmentationMode } from '../../../shared/segmentation'
import type { AppAPI } from '../../../preload/index.d'
import { PERSISTED_UNDO_STACK_LIMIT, PersistedImageStore } from './persisted-store'

export interface WorkingMask extends MaskShape {
  data: Uint8Array
}

export interface WorkingPolygon extends PolygonShape {}

export type WorkingShape = RectangleShape | WorkingMask | WorkingPolygon

interface AnnotationSnapshot {
  shapes: WorkingShape[]
  selectedShapeIds: string[]
}

function cloneShape(shape: WorkingShape): WorkingShape {
  if (shape.type === 'mask') {
    return { ...shape, bounds: { ...shape.bounds }, data: new Uint8Array(shape.data) }
  }
  if (shape.type === 'polygon') {
    return { ...shape, points: shape.points.map((point) => ({ ...point })) }
  }
  return { ...shape }
}

function cloneShapes(shapes: WorkingShape[]): WorkingShape[] {
  return shapes.map(cloneShape)
}

function cloneIdList(ids: string[]): string[] {
  return [...ids]
}

function isWorkingMask(shape: WorkingShape): shape is WorkingMask {
  return shape.type === 'mask'
}

export class AnnotationStore extends PersistedImageStore {
  readonly shapes = createSignal<WorkingShape[]>([])
  readonly selectedShapeIds = createSignal<string[]>([])
  readonly hoveredShapeId = createSignal<string | null>(null)
  readonly segmentationMode = createSignal<SegmentationMode>('instance')
  readonly canUndo = createSignal(false)
  readonly canRedo = createSignal(false)

  private undoStack: AnnotationSnapshot[] = []
  private redoStack: AnnotationSnapshot[] = []

  constructor(
    api?: AppAPI,
    onDirtyChange?: (dirty: boolean) => void,
    onStatusChange?: (relativePath: string, status: ImageStatus) => void
  ) {
    super(api, onDirtyChange, onStatusChange)
  }

  setSegmentationMode(mode: SegmentationMode): void {
    this.segmentationMode[1](mode)
  }

  primarySelectedId(): string | null {
    const ids = this.selectedShapeIds[0]()
    return ids.length > 0 ? ids[ids.length - 1] : null
  }

  isSelected(id: string): boolean {
    return this.selectedShapeIds[0]().includes(id)
  }

  hasSelection(): boolean {
    return this.selectedShapeIds[0]().length > 0
  }

  setHoveredShapeId(id: string | null): void {
    this.hoveredShapeId[1](id)
  }

  private snapshot(): AnnotationSnapshot {
    return {
      shapes: cloneShapes(this.shapes[0]()),
      selectedShapeIds: cloneIdList(this.selectedShapeIds[0]())
    }
  }

  private syncHistoryFlags(): void {
    this.canUndo[1](this.undoStack.length > 0)
    this.canRedo[1](this.redoStack.length > 0)
  }

  private pruneMissingSelection(): void {
    const shapeIds = new Set(this.shapes[0]().map((shape) => shape.id))
    const next = this.selectedShapeIds[0]().filter((id) => shapeIds.has(id))
    if (next.length !== this.selectedShapeIds[0]().length) {
      this.selectedShapeIds[1](next)
    }
  }

  pushUndo(): void {
    this.undoStack.push(this.snapshot())
    if (this.undoStack.length > PERSISTED_UNDO_STACK_LIMIT) this.undoStack.shift()
    this.redoStack = []
    this.syncHistoryFlags()
  }

  undo(): boolean {
    const previous = this.undoStack.pop()
    if (!previous) return false
    this.redoStack.push(this.snapshot())
    this.shapes[1](cloneShapes(previous.shapes))
    this.selectedShapeIds[1](cloneIdList(previous.selectedShapeIds))
    this.syncHistoryFlags()
    this.markDirty()
    return true
  }

  redo(): boolean {
    const next = this.redoStack.pop()
    if (!next) return false
    this.undoStack.push(this.snapshot())
    this.shapes[1](cloneShapes(next.shapes))
    this.selectedShapeIds[1](cloneIdList(next.selectedShapeIds))
    this.syncHistoryFlags()
    this.markDirty()
    return true
  }

  markDirty(): void {
    this.markDirtyAndSchedule(() => this.saveCurrent())
  }

  async loadForImage(
    relativePath: string,
    dimensions: { width: number; height: number }
  ): Promise<void> {
    const generation = this.beginLoadGeneration()
    await this.saveCurrent()
    if (!this.isLoadGenerationCurrent(generation)) return

    this.beginLoad(relativePath, dimensions)
    this.undoStack = []
    this.redoStack = []
    this.syncHistoryFlags()

    const [imageRecord, shapeList] = await Promise.all([
      this.api.images.getOrCreate(relativePath, dimensions.width, dimensions.height),
      this.api.shapes.list(relativePath)
    ])
    if (!this.isLoadGenerationCurrent(generation)) return

    this.imageStatus[1](imageRecord.status)

    const working: WorkingShape[] = []
    for (const shape of shapeList) {
      if (shape.type === 'rectangle' || shape.type === 'polygon') {
        working.push(shape)
        continue
      }
      const blob = await this.api.masks.get(shape.id)
      if (!this.isLoadGenerationCurrent(generation)) return
      if (!blob) continue
      working.push({
        ...shape,
        data: new Uint8Array(blob.data)
      })
    }

    if (!this.isLoadGenerationCurrent(generation)) return
    this.shapes[1](working)
    this.selectedShapeIds[1]([])
    this.hoveredShapeId[1](null)
    this.finishLoad()
  }

  clear(): void {
    this.clearCommon()
    this.shapes[1]([])
    this.selectedShapeIds[1]([])
    this.hoveredShapeId[1](null)
    this.undoStack = []
    this.redoStack = []
    this.syncHistoryFlags()
  }

  async saveCurrent(): Promise<void> {
    this.clearSaveTimer()
    const relativePath = this.currentRelativePath[0]()
    if (!relativePath || !this.dirty[0]()) return

    const shapes = this.shapes[0]()
    const rectangles: SaveRectangleInput[] = []
    const masks: { input: SaveMaskInput; data: ArrayBuffer }[] = []
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
          imageWidth: this.imageWidth,
          imageHeight: this.imageHeight
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
          imageWidth: this.imageWidth,
          imageHeight: this.imageHeight
        })
        continue
      }

      masks.push({
        input: {
          id: shape.id,
          relativePath,
          labelId: shape.labelId,
          zOrder: shape.zOrder,
          bounds: shape.bounds,
          imageWidth: this.imageWidth,
          imageHeight: this.imageHeight
        },
        data: shape.data.buffer.slice(
          shape.data.byteOffset,
          shape.data.byteOffset + shape.data.byteLength
        ) as ArrayBuffer
      })
    }

    const saved = await this.api.shapes.replaceImage(
      relativePath,
      rectangles,
      masks,
      polygons,
      this.imageWidth,
      this.imageHeight
    )

    const working: WorkingShape[] = []
    for (const shape of saved) {
      if (shape.type === 'rectangle' || shape.type === 'polygon') {
        working.push(shape)
        continue
      }
      const existing = shapes.find((item) => item.id === shape.id)
      if (existing && isWorkingMask(existing)) {
        working.push({ ...shape, data: existing.data })
      }
    }

    this.shapes[1](working)
    this.pruneMissingSelection()
    this.dirty[1](false)
    this.onDirtyChange?.(false)
  }

  async flush(): Promise<void> {
    await this.saveCurrent()
  }

  setShapes(shapes: WorkingShape[], options?: { pushUndo?: boolean }): void {
    if (options?.pushUndo) this.pushUndo()
    this.shapes[1](shapes)
    this.pruneMissingSelection()
    this.markDirty()
  }

  setSelectedShapeIds(ids: string[]): void {
    const shapeIds = new Set(this.shapes[0]().map((shape) => shape.id))
    this.selectedShapeIds[1](ids.filter((id) => shapeIds.has(id)))
  }

  selectOnly(id: string | null): void {
    if (!id) {
      this.selectedShapeIds[1]([])
      return
    }
    if (!this.shapes[0]().some((shape) => shape.id === id)) return
    this.selectedShapeIds[1]([id])
  }

  toggleSelect(id: string): void {
    if (!this.shapes[0]().some((shape) => shape.id === id)) return
    const current = this.selectedShapeIds[0]()
    if (current.includes(id)) {
      this.selectedShapeIds[1](current.filter((item) => item !== id))
      return
    }
    this.selectedShapeIds[1]([...current, id])
  }

  addToSelection(ids: string[]): void {
    const shapeIds = new Set(this.shapes[0]().map((shape) => shape.id))
    const current = new Set(this.selectedShapeIds[0]())
    for (const id of ids) {
      if (shapeIds.has(id)) current.add(id)
    }
    this.selectedShapeIds[1]([...current])
  }

  selectAll(): void {
    this.selectedShapeIds[1](this.shapes[0]().map((shape) => shape.id))
  }

  /** Cycle selection by creation order (Tab: newest → oldest). Returns the newly selected shape. */
  selectAdjacent(direction: 1 | -1): WorkingShape | null {
    const shapes = [...this.shapes[0]()].sort((left, right) => left.zOrder - right.zOrder)
    if (shapes.length === 0) return null
    const primary = this.primarySelectedId()
    const currentIndex = primary ? shapes.findIndex((shape) => shape.id === primary) : -1
    const step = -direction
    let nextIndex = currentIndex + step
    if (currentIndex < 0) nextIndex = direction > 0 ? shapes.length - 1 : 0
    if (nextIndex < 0) nextIndex = shapes.length - 1
    if (nextIndex >= shapes.length) nextIndex = 0
    const next = shapes[nextIndex]
    this.selectedShapeIds[1]([next.id])
    return next
  }

  clearSelection(): void {
    this.selectedShapeIds[1]([])
  }

  deleteSelected(): void {
    const selected = new Set(this.selectedShapeIds[0]())
    if (selected.size === 0) return
    this.pushUndo()
    this.shapes[1](this.shapes[0]().filter((shape) => !selected.has(shape.id)))
    this.selectedShapeIds[1]([])
    this.markDirty()
  }

  deleteShapes(ids: string[]): void {
    const toDelete = new Set(ids)
    if (toDelete.size === 0) return
    this.pushUndo()
    this.shapes[1](this.shapes[0]().filter((shape) => !toDelete.has(shape.id)))
    this.selectedShapeIds[1](this.selectedShapeIds[0]().filter((id) => !toDelete.has(id)))
    this.markDirty()
  }

  setShapeLabel(id: string, labelId: string): void {
    const shapes = this.shapes[0]()
    if (!shapes.some((shape) => shape.id === id)) return
    this.pushUndo()
    this.shapes[1](
      shapes.map((shape) => (shape.id === id ? { ...shape, labelId } : shape))
    )
    this.markDirty()
  }

  setLabelForSelected(labelId: string): void {
    const selected = new Set(this.selectedShapeIds[0]())
    if (selected.size === 0) return
    this.pushUndo()
    this.shapes[1](
      this.shapes[0]().map((shape) =>
        selected.has(shape.id) ? { ...shape, labelId } : shape
      )
    )
    this.markDirty()
  }

  createRectangle(
    labelId: string,
    rect: { x: number; y: number; width: number; height: number }
  ): RectangleShape {
    const now = new Date().toISOString()
    return {
      id: randomUUID(),
      type: 'rectangle',
      labelId,
      zOrder: this.shapes[0]().length,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      createdAt: now,
      updatedAt: now
    }
  }

  createMask(labelId: string, bounds: MaskShape['bounds'], data: Uint8Array): WorkingMask {
    const now = new Date().toISOString()
    return {
      id: randomUUID(),
      type: 'mask',
      labelId,
      zOrder: this.shapes[0]().length,
      bounds,
      data,
      createdAt: now,
      updatedAt: now
    }
  }

  createPolygon(labelId: string, points: { x: number; y: number }[]): WorkingPolygon {
    const now = new Date().toISOString()
    return {
      id: randomUUID(),
      type: 'polygon',
      labelId,
      zOrder: this.shapes[0]().length,
      points,
      createdAt: now,
      updatedAt: now
    }
  }
}
