import type { Point2D } from '../../../../shared/geometry'
import type { PolygonSimplificationSettings } from '../../../../shared/segmentation'
import { POLYGON_SIMPLIFICATION } from '../../../../shared/segmentation'
import type {
  SegmentationWorkerRequest,
  SegmentationWorkerResult,
  TopologyIssueMask
} from '../polygon/worker-types'

export type { SegmentationWorkerResult, TopologyIssueMask }

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
    const worker = this.getWorker()
    const id = ++this.nextRequestId
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      worker.postMessage(
        {
          id,
          data: buffer,
          width,
          height,
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

    this.worker = new Worker(new URL('../polygon/segmentation-worker.ts', import.meta.url), {
      type: 'module'
    })
    this.worker.onmessage = (event: MessageEvent<SegmentationWorkerResult>) => {
      const pending = this.pendingRequests.get(event.data.id)
      if (!pending) return
      this.pendingRequests.delete(event.data.id)
      pending.resolve(event.data)
    }
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'Mask conversion worker failed.')
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

export function createTopologyAlert(
  message: string,
  onDismiss: () => void
): TopologyAlert {
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
