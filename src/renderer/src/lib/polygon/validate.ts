import {
  MIN_TOPOLOGY_HOLE_PIXELS,
  MIN_TOPOLOGY_ISLAND_PIXELS
} from '../../../../shared/segmentation'
import {
  extractComponentMask,
  findConnectedComponents,
  findHolePixels,
  type Point2D
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

function groupBackgroundComponents(candidates: Point2D[]): MaskTopologyIssue[] {
  if (candidates.length === 0) return []

  const candidateSet = new Set(candidates.map((point) => `${point.x},${point.y}`))
  const visited = new Set<string>()
  const groups: MaskTopologyIssue[] = []

  for (const seed of candidates) {
    const seedKey = `${seed.x},${seed.y}`
    if (!candidateSet.has(seedKey) || visited.has(seedKey)) continue

    const pixels: Point2D[] = []
    const stack = [seed]

    while (stack.length > 0) {
      const current = stack.pop()!
      const key = `${current.x},${current.y}`
      if (!candidateSet.has(key) || visited.has(key)) continue
      visited.add(key)
      pixels.push(current)

      stack.push(
        { x: current.x - 1, y: current.y },
        { x: current.x + 1, y: current.y },
        { x: current.x, y: current.y - 1 },
        { x: current.x, y: current.y + 1 }
      )
    }

    if (pixels.length >= MIN_TOPOLOGY_HOLE_PIXELS) {
      groups.push({ kind: 'hole', pixels })
    }
  }

  return groups
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

export function hasSelfIntersection(points: Point2D[]): boolean {
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
  const components = findConnectedComponents(binary, width, height)
  if (components.length === 0) {
    return { valid: false, islands: [], holes: [], largestComponentIndex: -1 }
  }

  const largest = components[0]
  const largestMask = extractComponentMask(binary, width, height, largest)
  const holePixels = findHolePixels(largestMask, width, height)

  const islands: MaskTopologyIssue[] = components
    .slice(1)
    .filter((component) => component.pixels.length >= MIN_TOPOLOGY_ISLAND_PIXELS)
    .map((component) => ({
      kind: 'island' as const,
      pixels: component.pixels
    }))

  const holes = groupBackgroundComponents(holePixels)

  return {
    valid: islands.length === 0 && holes.length === 0,
    islands,
    holes,
    largestComponentIndex: 0
  }
}
