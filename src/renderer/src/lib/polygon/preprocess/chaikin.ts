import type { Point2D } from '../../../../../shared/geometry'

/** Chaikin corner-cutting smoothing for a closed contour. */
export function chaikinSmooth(contour: Point2D[], iterations: number): Point2D[] {
  if (contour.length < 3 || iterations <= 0) return contour.slice()

  let current = contour
  for (let iteration = 0; iteration < iterations; iteration++) {
    const next: Point2D[] = []
    for (let index = 0; index < current.length; index++) {
      const p0 = current[index]
      const p1 = current[(index + 1) % current.length]
      next.push(
        { x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y },
        { x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y }
      )
    }
    current = next
  }

  return current
}
