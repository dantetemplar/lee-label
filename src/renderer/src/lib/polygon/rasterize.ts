import type { Point2D } from '../../../../shared/geometry'
import { hitTestPolygon } from '../annotation-coords'

/** Rasterize a simple polygon into a full-image binary mask (255 = inside). */
export function rasterizePolygon(points: Point2D[], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height)
  if (points.length < 3 || width <= 0 || height <= 0) return mask

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) {
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      for (let index = 1; index < points.length; index++) {
        ctx.lineTo(points[index].x, points[index].y)
      }
      ctx.closePath()
      ctx.fillStyle = '#ffffff'
      ctx.fill()

      const imageData = ctx.getImageData(0, 0, width, height)
      for (let index = 0; index < mask.length; index++) {
        mask[index] = imageData.data[index * 4 + 3] > 0 ? 255 : 0
      }
      return mask
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (hitTestPolygon(x + 0.5, y + 0.5, points)) {
        mask[y * width + x] = 255
      }
    }
  }
  return mask
}
