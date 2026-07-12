import {
  MIN_TOPOLOGY_HOLE_PIXELS,
  MIN_TOPOLOGY_ISLAND_PIXELS
} from '../../../../shared/segmentation'
import type { Point2D } from '../../../../shared/geometry'
import {
  collectComponentPixels,
  extractLabeledComponentMask,
  findHoleComponents,
  labelConnectedComponents
} from './contour-trace'

export interface MaskTopologyIssue {
  kind: 'island' | 'hole'
  pixels: Point2D[]
}

export interface MaskTopologyAnalysis {
  valid: boolean
  islands: MaskTopologyIssue[]
  holes: MaskTopologyIssue[]
  largestComponentIndex: number
}

export function binarizeMask(data: Uint8Array): Uint8Array {
  const binary = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    binary[i] = data[i] > 0 ? 255 : 0
  }
  return binary
}

function orientation(a: Point2D, b: Point2D, c: Point2D): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)
  if (Math.abs(value) < 1e-9) return 0
  return value > 0 ? 1 : 2
}

function onSegment(a: Point2D, b: Point2D, c: Point2D): boolean {
  return (
    Math.min(a.x, c.x) <= b.x &&
    b.x <= Math.max(a.x, c.x) &&
    Math.min(a.y, c.y) <= b.y &&
    b.y <= Math.max(a.y, c.y)
  )
}

function segmentsIntersect(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): boolean {
  const o1 = orientation(a1, a2, b1)
  const o2 = orientation(a1, a2, b2)
  const o3 = orientation(b1, b2, a1)
  const o4 = orientation(b1, b2, a2)

  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(a1, b1, a2)) return true
  if (o2 === 0 && onSegment(a1, b2, a2)) return true
  if (o3 === 0 && onSegment(b1, a1, b2)) return true
  if (o4 === 0 && onSegment(b1, a2, b2)) return true
  return false
}

function hasSelfIntersection(points: Point2D[]): boolean {
  const count = points.length
  if (count < 4) return false

  for (let i = 0; i < count; i++) {
    const a1 = points[i]
    const a2 = points[(i + 1) % count]
    for (let j = i + 1; j < count; j++) {
      if (Math.abs(i - j) <= 1) continue
      if (i === 0 && j === count - 1) continue
      const b1 = points[j]
      const b2 = points[(j + 1) % count]
      if (segmentsIntersect(a1, a2, b1, b2)) return true
    }
  }

  return false
}

export function isSimplePolygon(points: Point2D[]): boolean {
  return points.length >= 3 && !hasSelfIntersection(points)
}

export function analyzeMaskTopology(
  data: Uint8Array,
  width: number,
  height: number
): MaskTopologyAnalysis {
  const binary = binarizeMask(data)
  const { labels, components } = labelConnectedComponents(binary, width, height)
  if (components.length === 0) {
    return { valid: false, islands: [], holes: [], largestComponentIndex: -1 }
  }

  const largest = components[0]
  const largestMask = extractLabeledComponentMask(labels, width, height, largest.label)
  const holeRegions = findHoleComponents(
    largestMask,
    width,
    height,
    MIN_TOPOLOGY_HOLE_PIXELS
  )

  const islands: MaskTopologyIssue[] = []
  for (let i = 1; i < components.length; i++) {
    const component = components[i]
    if (component.pixelCount < MIN_TOPOLOGY_ISLAND_PIXELS) continue
    islands.push({
      kind: 'island',
      pixels: collectComponentPixels(labels, width, component)
    })
  }

  const holes: MaskTopologyIssue[] = holeRegions.map((hole) => ({
    kind: 'hole' as const,
    pixels: hole.pixels
  }))

  return {
    valid: islands.length === 0 && holes.length === 0,
    islands,
    holes,
    largestComponentIndex: 0
  }
}
