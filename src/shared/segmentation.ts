export type SegmentationMode = 'instance' | 'semantic'

export interface PolygonSimplificationSettings {
  /** RDP tolerance as a fraction of closed contour perimeter. */
  epsilonRatio: number
}

export interface ProjectSettings {
  name: string
  segmentationMode: SegmentationMode
}

export interface PolygonPoint {
  x: number
  y: number
}

export interface PolygonRing {
  points: PolygonPoint[]
}

export const DEFAULT_SEGMENTATION_MODE: SegmentationMode = 'instance'

export const POLYGON_SIMPLIFICATION: PolygonSimplificationSettings = {
  epsilonRatio: 0.005
}

/** Ignore disconnected speckle smaller than this when validating mask topology. */
export const MIN_TOPOLOGY_ISLAND_PIXELS = 16

/** Ignore enclosed voids smaller than this when validating mask topology. */
export const MIN_TOPOLOGY_HOLE_PIXELS = 16

export const SETTINGS_KEY_SEGMENTATION_MODE = 'segmentation_mode'
