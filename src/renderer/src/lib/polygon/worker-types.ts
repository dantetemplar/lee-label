import type { Point2D } from '../../../../shared/geometry'
import type { PolygonSimplificationSettings } from '../../../../shared/segmentation'

export interface TopologyIssueMask {
  id: string
  kind: 'island' | 'hole'
  x: number
  y: number
  width: number
  height: number
  data: Uint8Array
}

export interface SegmentationWorkerResult {
  id: number
  issues: TopologyIssueMask[]
  polygon: Point2D[] | null
}

export interface SegmentationWorkerRequest {
  id: number
  data: ArrayBuffer
  width: number
  height: number
  repairTopology: boolean
  simplification: PolygonSimplificationSettings
}
