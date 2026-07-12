import { POLYGON_SIMPLIFICATION } from '../../../../shared/segmentation'
import { maskToPolygon } from './mask-to-polygon'
import { repairMaskTopology } from './repair'
import { analyzeMaskTopology, binarizeMask, type MaskTopologyIssue } from './validate'
import type {
  SegmentationWorkerRequest,
  SegmentationWorkerResult,
  TopologyIssueMask
} from './worker-types'

interface WorkerScope {
  onmessage: (event: MessageEvent<SegmentationWorkerRequest>) => void
  postMessage(message: SegmentationWorkerResult, transfer?: Transferable[]): void
}

function toIssueMask(
  issue: MaskTopologyIssue,
  id: string,
  offsetX: number,
  offsetY: number
): TopologyIssueMask {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const pixel of issue.pixels) {
    minX = Math.min(minX, pixel.x)
    minY = Math.min(minY, pixel.y)
    maxX = Math.max(maxX, pixel.x)
    maxY = Math.max(maxY, pixel.y)
  }

  const width = maxX - minX + 1
  const height = maxY - minY + 1
  const data = new Uint8Array(width * height)
  for (const pixel of issue.pixels) {
    data[(pixel.y - minY) * width + pixel.x - minX] = 255
  }

  return {
    id,
    kind: issue.kind,
    x: minX + offsetX,
    y: minY + offsetY,
    width,
    height,
    data
  }
}

const workerScope = self as unknown as WorkerScope

workerScope.onmessage = (event: MessageEvent<SegmentationWorkerRequest>): void => {
  const { id, data, width, height, offsetX, offsetY, repairTopology, simplification } = event.data
  let mask = binarizeMask(new Uint8Array(data))
  const topology = analyzeMaskTopology(mask, width, height)
  const issues = [...topology.islands, ...topology.holes]

  if (issues.length > 0 && !repairTopology) {
    const issueMasks = issues.map((issue, index) =>
      toIssueMask(issue, `${id}:${index}`, offsetX, offsetY)
    )
    workerScope.postMessage(
      { id, issues: issueMasks, polygon: null } satisfies SegmentationWorkerResult,
      issueMasks.map((issue) => issue.data.buffer as ArrayBuffer)
    )
    return
  }

  if (repairTopology) {
    mask = repairMaskTopology(mask, width, height)
  }

  const polygon = maskToPolygon(
    mask,
    width,
    height,
    simplification ?? POLYGON_SIMPLIFICATION
  )
  const offsetPolygon =
    polygon && (offsetX !== 0 || offsetY !== 0)
      ? polygon.map((point) => ({ x: point.x + offsetX, y: point.y + offsetY }))
      : polygon

  workerScope.postMessage({
    id,
    issues: [],
    polygon: offsetPolygon
  } satisfies SegmentationWorkerResult)
}
