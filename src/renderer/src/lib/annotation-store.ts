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
  selectedShapeId: string | null
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

function isWorkingMask(shape: WorkingShape): shape is WorkingMask {
  return shape.type === 'mask'
}

export class AnnotationStore extends PersistedImageStore {
  readonly shapes = createSignal<WorkingShape[]>([])
  readonly selectedShapeId = createSignal<string | null>(null)
  readonly segmentationMode = createSignal<SegmentationMode>('instance')

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

  private snapshot(): AnnotationSnapshot {
    return {
      shapes: cloneShapes(this.shapes[0]()),
      selectedShapeId: this.selectedShapeId[0]()
    }
  }

  pushUndo(): void {
    this.undoStack.push(this.snapshot())
    if (this.undoStack.length > PERSISTED_UNDO_STACK_LIMIT) this.undoStack.shift()
    this.redoStack = []
  }

  undo(): boolean {
    const previous = this.undoStack.pop()
    if (!previous) return false
    this.redoStack.push(this.snapshot())
    this.shapes[1](cloneShapes(previous.shapes))
    this.selectedShapeId[1](previous.selectedShapeId)
    this.markDirty()
    return true
  }

  redo(): boolean {
    const next = this.redoStack.pop()
    if (!next) return false
    this.undoStack.push(this.snapshot())
    this.shapes[1](cloneShapes(next.shapes))
    this.selectedShapeId[1](next.selectedShapeId)
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
    await this.saveCurrent()
    this.beginLoad(relativePath, dimensions)
    this.undoStack = []
    this.redoStack = []

    const [imageRecord, shapeList] = await Promise.all([
      this.api.images.getOrCreate(relativePath, dimensions.width, dimensions.height),
      this.api.shapes.list(relativePath)
    ])

    this.imageStatus[1](imageRecord.status)

    const working: WorkingShape[] = []
    for (const shape of shapeList) {
      if (shape.type === 'rectangle' || shape.type === 'polygon') {
        working.push(shape)
        continue
      }
      const blob = await this.api.masks.get(shape.id)
      if (!blob) continue
      working.push({
        ...shape,
        data: new Uint8Array(blob.data)
      })
    }

    this.shapes[1](working)
    this.selectedShapeId[1](null)
    this.finishLoad()
  }

  clear(): void {
    this.clearCommon()
    this.shapes[1]([])
    this.selectedShapeId[1](null)
    this.undoStack = []
    this.redoStack = []
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
    this.dirty[1](false)
    this.onDirtyChange?.(false)
  }

  async flush(): Promise<void> {
    await this.saveCurrent()
  }

  setShapes(shapes: WorkingShape[], options?: { pushUndo?: boolean }): void {
    if (options?.pushUndo) this.pushUndo()
    this.shapes[1](shapes)
    this.markDirty()
  }

  setSelectedShapeId(id: string | null): void {
    this.selectedShapeId[1](id)
  }

  deleteSelected(): void {
    const selectedId = this.selectedShapeId[0]()
    if (!selectedId) return
    this.pushUndo()
    this.shapes[1](this.shapes[0]().filter((shape) => shape.id !== selectedId))
    this.selectedShapeId[1](null)
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
