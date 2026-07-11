import { createSignal } from 'solid-js'
import type { ImageStatus } from '../../../shared/annotations'
import type { AppAPI } from '../../../preload/index.d'
import { PERSISTED_UNDO_STACK_LIMIT, PersistedImageStore } from './persisted-store'

interface SemanticSnapshot {
  classMap: Uint16Array
}

export class SemanticMapStore extends PersistedImageStore {
  readonly classMap = createSignal<Uint16Array | null>(null)

  private undoStack: SemanticSnapshot[] = []
  private redoStack: SemanticSnapshot[] = []

  constructor(
    api?: AppAPI,
    onDirtyChange?: (dirty: boolean) => void,
    onStatusChange?: (relativePath: string, status: ImageStatus) => void
  ) {
    super(api, onDirtyChange, onStatusChange)
  }

  private snapshot(): SemanticSnapshot | null {
    const map = this.classMap[0]()
    if (!map) return null
    return { classMap: new Uint16Array(map) }
  }

  pushUndo(): void {
    const snap = this.snapshot()
    if (!snap) return
    this.undoStack.push(snap)
    if (this.undoStack.length > PERSISTED_UNDO_STACK_LIMIT) this.undoStack.shift()
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

    const [imageRecord, semantic] = await Promise.all([
      this.api.images.getOrCreate(relativePath, dimensions.width, dimensions.height),
      this.api.semanticMasks.get(relativePath)
    ])

    this.imageStatus[1](imageRecord.status)

    if (semantic) {
      this.classMap[1](new Uint16Array(semantic.data))
    } else {
      this.classMap[1](new Uint16Array(dimensions.width * dimensions.height))
    }

    this.finishLoad()
  }

  clear(): void {
    this.clearCommon()
    this.classMap[1](null)
    this.undoStack = []
    this.redoStack = []
  }

  async saveCurrent(): Promise<void> {
    this.clearSaveTimer()
    const relativePath = this.currentRelativePath[0]()
    const map = this.classMap[0]()
    if (!relativePath || !map || !this.dirty[0]()) return

    await this.api.semanticMasks.save(
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
}
