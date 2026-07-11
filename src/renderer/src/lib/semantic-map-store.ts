import { createSignal } from 'solid-js'
import type { ImageStatus } from '../../../shared/annotations'

interface SemanticSnapshot {
  classMap: Uint16Array
}

export class SemanticMapStore {
  readonly classMap = createSignal<Uint16Array | null>(null)
  readonly dirty = createSignal(false)
  readonly loading = createSignal(false)
  readonly currentRelativePath = createSignal<string | null>(null)
  readonly imageStatus = createSignal<ImageStatus>('todo')

  private undoStack: SemanticSnapshot[] = []
  private redoStack: SemanticSnapshot[] = []
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private imageWidth = 0
  private imageHeight = 0

  constructor(
    private readonly onDirtyChange?: (dirty: boolean) => void,
    private readonly onStatusChange?: (relativePath: string, status: ImageStatus) => void
  ) {}

  private snapshot(): SemanticSnapshot | null {
    const map = this.classMap[0]()
    if (!map) return null
    return { classMap: new Uint16Array(map) }
  }

  pushUndo(): void {
    const snap = this.snapshot()
    if (!snap) return
    this.undoStack.push(snap)
    if (this.undoStack.length > 50) this.undoStack.shift()
    this.redoStack = []
  }

  undo(): boolean {
    const previous = this.undoStack.pop()
    if (!previous) return false
    const current = this.snapshot()
    if (current) this.redoStack.push(current)
    this.classMap[1](previous.classMap)
    this.markDirty()
    return true
  }

  redo(): boolean {
    const next = this.redoStack.pop()
    if (!next) return false
    const current = this.snapshot()
    if (current) this.undoStack.push(current)
    this.classMap[1](next.classMap)
    this.markDirty()
    return true
  }

  markDirty(): void {
    if (!this.dirty[0]()) {
      this.dirty[1](true)
      this.onDirtyChange?.(true)
    }
    const relativePath = this.currentRelativePath[0]()
    if (relativePath && this.imageStatus[0]() === 'todo') {
      this.imageStatus[1]('in_progress')
      void window.api.images.setStatus(relativePath, 'in_progress').then((record) => {
        this.imageStatus[1](record.status)
        this.onStatusChange?.(relativePath, record.status)
      })
    }
    this.scheduleSave()
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      void this.saveCurrent()
    }, 1000)
  }

  async loadForImage(
    relativePath: string,
    dimensions: { width: number; height: number }
  ): Promise<void> {
    await this.saveCurrent()
    this.loading[1](true)
    this.currentRelativePath[1](relativePath)
    this.imageWidth = dimensions.width
    this.imageHeight = dimensions.height
    this.undoStack = []
    this.redoStack = []

    const [imageRecord, semantic] = await Promise.all([
      window.api.images.getOrCreate(relativePath, dimensions.width, dimensions.height),
      window.api.semanticMasks.get(relativePath)
    ])

    this.imageStatus[1](imageRecord.status)

    if (semantic) {
      this.classMap[1](new Uint16Array(semantic.data))
    } else {
      this.classMap[1](new Uint16Array(dimensions.width * dimensions.height))
    }

    this.dirty[1](false)
    this.onDirtyChange?.(false)
    this.loading[1](false)
  }

  clear(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.currentRelativePath[1](null)
    this.classMap[1](null)
    this.dirty[1](false)
    this.onDirtyChange?.(false)
    this.imageStatus[1]('todo')
    this.undoStack = []
    this.redoStack = []
  }

  async saveCurrent(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = undefined
    }
    const relativePath = this.currentRelativePath[0]()
    const map = this.classMap[0]()
    if (!relativePath || !map || !this.dirty[0]()) return

    await window.api.semanticMasks.save(
      relativePath,
      this.imageWidth,
      this.imageHeight,
      map.buffer.slice(map.byteOffset, map.byteOffset + map.byteLength) as ArrayBuffer
    )

    this.dirty[1](false)
    this.onDirtyChange?.(false)
  }

  async flush(): Promise<void> {
    await this.saveCurrent()
  }

  getMutableClassMap(): Uint16Array | null {
    return this.classMap[0]()
  }

  setClassMap(map: Uint16Array): void {
    this.classMap[1](map)
    this.markDirty()
  }

  async setImageStatus(status: ImageStatus): Promise<void> {
    const relativePath = this.currentRelativePath[0]()
    if (!relativePath) return
    const record = await window.api.images.setStatus(relativePath, status)
    this.imageStatus[1](record.status)
    this.onStatusChange?.(relativePath, record.status)
  }

  getImageDimensions(): { width: number; height: number } {
    return { width: this.imageWidth, height: this.imageHeight }
  }
}