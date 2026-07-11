import type { PolygonSimplificationSettings } from '../../../../shared/segmentation'
import {
  extractComponentMask,
  extractExternalContour,
  findConnectedComponents,
  type Point2D
} from './contour-trace'
import { approxPolyDPFromSettings } from './simplify'
import { binarizeMask, isSimplePolygon } from './validate'

export function convexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 3) return points.slice()

  const sorted = [...points].sort((left, right) =>
    left.x === right.x ? left.y - right.y : left.x - right.x
  )

  const lower: Point2D[] = []
  for (const point of sorted) {
    while (lower.length >= 2) {
      const a = lower[lower.length - 2]
      const b = lower[lower.length - 1]
      if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) <= 0) {
        lower.pop()
      } else {
        break
      }
    }
    lower.push(point)
  }

  const upper: Point2D[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i]
    while (upper.length >= 2) {
      const a = upper[upper.length - 2]
      const b = upper[upper.length - 1]
      if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) <= 0) {
        upper.pop()
      } else {
        break
      }
    }
    upper.push(point)
  }

  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

function boundingBoxRing(bounds: {
  minX: number
  minY: number
  maxX: number
  maxY: number
}): Point2D[] {
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX + 1, y: bounds.minY },
    { x: bounds.maxX + 1, y: bounds.maxY + 1 },
    { x: bounds.minX, y: bounds.maxY + 1 }
  ]
}

/** Step 2 — RDP approximation with increasing tolerance, then convex-hull fallback. */
function approximateContour(contour: Point2D[], settings: PolygonSimplificationSettings): Point2D[] {
  if (contour.length < 3) return contour.slice()

  for (let scale = 1; scale <= 64; scale *= 2) {
    const simplified = approxPolyDPFromSettings(contour, settings, scale)
    if (simplified.length >= 3 && isSimplePolygon(simplified)) {
      return simplified
    }
  }

  const hull = convexHull(contour)
  return hull.length >= 3 ? hull : contour.slice()
}

/**
 * Convert a single-component, hole-free binary mask into a simple polygon.
 *
 * Pipeline:
 * 1. Contour detection — external border chain (Suzuki–Abe / findContours-style)
 * 2. Polygon approximation — Ramer–Douglas–Peucker (approxPolyDP-style)
 */
export function maskToPolygon(
  data: Uint8Array,
  width: number,
  height: number,
  settings: PolygonSimplificationSettings
): Point2D[] | null {
  const binary = binarizeMask(data)
  const components = findConnectedComponents(binary, width, height)
  if (components.length === 0) return null

  const component = components[0]
  const mask = extractComponentMask(binary, width, height, component)

  if (component.pixels.length === 1) {
    return boundingBoxRing(component.bounds)
  }

  const contour = extractExternalContour(mask, width, height)
  const source = contour.length >= 3 ? contour : boundingBoxRing(component.bounds)
  const polygon = approximateContour(source, settings)

  return polygon.length >= 3 ? polygon : boundingBoxRing(component.bounds)
}
