import type { Point2D } from '../../../../shared/geometry'
import type { PolygonSimplificationSettings } from '../../../../shared/segmentation'
import { POLYGON_SIMPLIFICATION } from '../../../../shared/segmentation'
import { computeMaskBounds, cropMaskBitmap } from '../mask-bitmap'
import type {
  SegmentationWorkerRequest,
  SegmentationWorkerResult,
  TopologyIssueMask
} from '../polygon/worker-types'
import SegmentationWorker from '../polygon/segmentation-worker?worker&inline'

export type { SegmentationWorkerResult, TopologyIssueMask }

const CROP_PAD = 1

function transferableMaskBuffer(data: Uint8Array): ArrayBuffer {
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
    return data.buffer as ArrayBuffer
  }
  return data.slice().buffer as ArrayBuffer
}

export class TopologySession {
  private worker: Worker | null = null
  private nextRequestId = 0
  private pendingRequests = new Map<
    number,
    { resolve: (result: SegmentationWorkerResult) => void; reject: (error: Error) => void }
  >()

  convertMask(
    data: Uint8Array,
    width: number,
    height: number,
    repairTopology: boolean,
    simplification: PolygonSimplificationSettings = POLYGON_SIMPLIFICATION
  ): Promise<SegmentationWorkerResult> {
    const id = ++this.nextRequestId
    const bounds = computeMaskBounds(data, width, height)
    if (!bounds) {
      return Promise.resolve({ id, issues: [], polygon: null })
    }

    const x = Math.max(0, bounds.x - CROP_PAD)
    const y = Math.max(0, bounds.y - CROP_PAD)
    const right = Math.min(width, bounds.x + bounds.width + CROP_PAD)
    const bottom = Math.min(height, bounds.y + bounds.height + CROP_PAD)
    const crop = { x, y, width: right - x, height: bottom - y }
    const cropped = cropMaskBitmap(data, width, crop)
    const buffer = transferableMaskBuffer(cropped)

    const worker = this.getWorker()
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      worker.postMessage(
        {
          id,
          data: buffer,
          width: crop.width,
          height: crop.height,
          offsetX: crop.x,
          offsetY: crop.y,
          repairTopology,
          simplification
        } satisfies SegmentationWorkerRequest,
        [buffer]
      )
    })
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error('Topology session disposed'))
    }
    this.pendingRequests.clear()
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker

    this.worker = new SegmentationWorker()
    this.worker.onmessage = (event: MessageEvent<SegmentationWorkerResult>) => {
      const pending = this.pendingRequests.get(event.data.id)
      if (!pending) return
      this.pendingRequests.delete(event.data.id)
      pending.resolve(event.data)
    }
    this.worker.onerror = (event) => {
      console.error('Mask conversion worker error:', {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        error: event.error
      })
      const location = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : ''
      const error = new Error(`${event.message || 'Mask conversion worker failed.'}${location}`)
      for (const pending of this.pendingRequests.values()) {
        pending.reject(error)
      }
      this.pendingRequests.clear()
      this.worker?.terminate()
      this.worker = null
    }

    return this.worker
  }
}

export interface TopologyAlert {
  message: string
  onDismiss: () => void
}

export function createTopologyAlert(message: string, onDismiss: () => void): TopologyAlert {
  return { message, onDismiss }
}

export function topologyHintsFromIssues(
  issues: TopologyIssueMask[]
): Array<TopologyIssueMask & { colorRgb: [number, number, number] }> {
  return issues.map((issue) => ({
    ...issue,
    colorRgb: [0.94, 0.27, 0.27] as [number, number, number]
  }))
}

export type { Point2D }
