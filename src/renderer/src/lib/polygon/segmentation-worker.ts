import { POLYGON_SIMPLIFICATION } from '../../../../shared/segmentation'
import { maskToPolygon } from './mask-to-polygon'
import { repairMaskTopology } from './repair'
import { analyzeMaskTopology, binarizeMask, type MaskTopologyIssue } from './validate'

interface ConvertRequest {
  id: number
  data: ArrayBuffer
  width: number
  height: number
  repairTopology: boolean
}

interface ConvertResult {
  id: number
  issues: TopologyIssueMask[]
  polygon: { x: number; y: number }[] | null
}

interface TopologyIssueMask {
  id: string
  kind: MaskTopologyIssue['kind']
  x: number
  y: number
  width: number
  height: number
  data: Uint8Array
}

interface WorkerScope {
  onmessage: (event: MessageEvent<ConvertRequest>) => void
  postMessage(message: ConvertResult, transfer?: Transferable[]): void
}

function toIssueMask(issue: MaskTopologyIssue, id: string): TopologyIssueMask {
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
    x: minX,
    y: minY,
    width,
    height,
    data
  }
}

const workerScope = self as unknown as WorkerScope

workerScope.onmessage = (event: MessageEvent<ConvertRequest>): void => {
  const { id, data, width, height, repairTopology } = event.data
  let mask = binarizeMask(new Uint8Array(data))
  const topology = analyzeMaskTopology(mask, width, height)
  const issues = [...topology.islands, ...topology.holes]

  if (issues.length > 0 && !repairTopology) {
    const issueMasks = issues.map((issue, index) => toIssueMask(issue, `${id}:${index}`))
    workerScope.postMessage(
      { id, issues: issueMasks, polygon: null } satisfies ConvertResult,
      issueMasks.map((issue) => issue.data.buffer as ArrayBuffer)
    )
    return
  }

  if (repairTopology) {
    mask = repairMaskTopology(mask, width, height)
  }

  const polygon = maskToPolygon(mask, width, height, POLYGON_SIMPLIFICATION)
  workerScope.postMessage({ id, issues: [], polygon } satisfies ConvertResult)
}
