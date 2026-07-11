import type { PolygonSimplificationSettings } from '../../../../shared/segmentation'
import type { Point2D } from './contour-trace'

function perpendicularDistance(point: Point2D, start: Point2D, end: Point2D): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }
  const numerator = Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x)
  return numerator / Math.hypot(dx, dy)
}

function douglasPeucker(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length <= 2) return points.slice()

  let maxDistance = 0
  let index = 0
  const end = points.length - 1

  for (let i = 1; i < end; i++) {
    const distance = perpendicularDistance(points[i], points[0], points[end])
    if (distance > maxDistance) {
      maxDistance = distance
      index = i
    }
  }

  if (maxDistance > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon)
    const right = douglasPeucker(points.slice(index), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [points[0], points[end]]
}

/** Closed contour perimeter (OpenCV `arcLength(contour, closed=True)`). */
export function contourArcLength(contour: Point2D[]): number {
  if (contour.length < 2) return 0

  let length = 0
  for (let i = 0; i < contour.length; i++) {
    const next = contour[(i + 1) % contour.length]
    length += Math.hypot(next.x - contour[i].x, next.y - contour[i].y)
  }
  return length
}

/**
 * Ramer–Douglas–Peucker polygon approximation (OpenCV `approxPolyDP`).
 * `epsilon` is the maximum perpendicular distance tolerance in image pixels.
 */
export function approxPolyDP(contour: Point2D[], epsilon: number, closed = true): Point2D[] {
  if (contour.length <= 2) return contour.slice()
  if (!closed) return douglasPeucker(contour, epsilon)
  if (contour.length === 3) return contour.slice()

  const ring = [...contour, contour[0]]
  const simplified = douglasPeucker(ring, epsilon)
  if (simplified.length <= 1) return contour.slice()

  const last = simplified[simplified.length - 1]
  if (last.x === simplified[0].x && last.y === simplified[0].y) {
    simplified.pop()
  }

  return simplified.length >= 3 ? simplified : contour.slice()
}

/** `epsilon = epsilonRatio * arcLength`, matching the OpenCV default of 0.02. */
export function approxPolyDPFromSettings(
  contour: Point2D[],
  settings: PolygonSimplificationSettings,
  epsilonScale = 1
): Point2D[] {
  const perimeter = contourArcLength(contour)
  const epsilon = settings.epsilonRatio * epsilonScale * perimeter
  return approxPolyDP(contour, epsilon, true)
}
