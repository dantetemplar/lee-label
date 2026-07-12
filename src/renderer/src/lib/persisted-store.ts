import { createSignal } from 'solid-js'
import type { ImageStatus } from '../../../shared/annotations'
import type { AppAPI } from '../../../preload/index.d'

const SAVE_DEBOUNCE_MS = 1000

export const PERSISTED_UNDO_STACK_LIMIT = 50

export class PersistedImageStore {
  readonly dirty = createSignal(false)
  readonly loading = createSignal(false)
  readonly currentRelativePath = createSignal<string | null>(null)
  readonly imageStatus = createSignal<ImageStatus>('todo')

  protected saveTimer: ReturnType<typeof setTimeout> | undefined
  protected imageWidth = 0
  protected imageHeight = 0
  protected loadGeneration = 0

  constructor(
    protected readonly api: AppAPI = window.api,
    protected readonly onDirtyChange?: (dirty: boolean) => void,
    protected readonly onStatusChange?: (relativePath: string, status: ImageStatus) => void
  ) {}

  protected beginLoadGeneration(): number {
    this.loadGeneration += 1
    return this.loadGeneration
  }

  protected isLoadGenerationCurrent(generation: number): boolean {
    return generation === this.loadGeneration
  }

  protected markDirtyAndSchedule(onSave: () => Promise<void>): void {
    if (!this.dirty[0]()) {
      this.dirty[1](true)
      this.onDirtyChange?.(true)
    }
    const relativePath = this.currentRelativePath[0]()
    if (relativePath && this.imageStatus[0]() === 'todo') {
      this.imageStatus[1]('in_progress')
      void this.api.images.setStatus(relativePath, 'in_progress').then((record) => {
        this.imageStatus[1](record.status)
        this.onStatusChange?.(relativePath, record.status)
      })
    }
    this.scheduleSave(onSave)
  }

  protected scheduleSave(onSave: () => Promise<void>): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      void onSave()
    }, SAVE_DEBOUNCE_MS)
  }

  protected clearSaveTimer(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = undefined
    }
  }

  protected beginLoad(relativePath: string, dimensions: { width: number; height: number }): void {
    this.loading[1](true)
    this.currentRelativePath[1](relativePath)
    this.imageWidth = dimensions.width
    this.imageHeight = dimensions.height
  }

  protected finishLoad(): void {
    this.dirty[1](false)
    this.onDirtyChange?.(false)
    this.loading[1](false)
  }

  protected clearCommon(): void {
    this.clearSaveTimer()
    this.currentRelativePath[1](null)
    this.dirty[1](false)
    this.onDirtyChange?.(false)
    this.imageStatus[1]('todo')
    this.imageWidth = 0
    this.imageHeight = 0
  }

  async setImageStatus(status: ImageStatus): Promise<void> {
    const relativePath = this.currentRelativePath[0]()
    if (!relativePath) return
    const record = await this.api.images.setStatus(relativePath, status)
    this.imageStatus[1](record.status)
    this.onStatusChange?.(relativePath, record.status)
  }

  getImageDimensions(): { width: number; height: number } {
    return { width: this.imageWidth, height: this.imageHeight }
  }
}
