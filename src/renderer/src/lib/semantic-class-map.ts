import {
  forEachBrushStrokeCenter,
  forEachPixelBrushPixel,
  usesPixelBrushShape
} from './brush/brush-shapes'

import type { Point2D } from '../../../shared/geometry'

function stampCapsuleOnClassMap(
  map: Uint16Array,
  width: number,
  height: number,
  from: Point2D,
  to: Point2D,
  radius: number,
  classId: number
): void {
  const radiusSq = radius * radius
  const minX = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius))
  const minY = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius))
  const maxX = Math.min(width - 1, Math.ceil(Math.max(from.x, to.x) + radius))
  const maxY = Math.min(height - 1, Math.ceil(Math.max(from.y, to.y) + radius))

  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSq = dx * dx + dy * dy

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let distSq: number
      if (lengthSq === 0) {
        distSq = (x - from.x) ** 2 + (y - from.y) ** 2
      } else {
        const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / lengthSq))
        const projX = from.x + t * dx
        const projY = from.y + t * dy
        distSq = (x - projX) ** 2 + (y - projY) ** 2
      }
      if (distSq <= radiusSq) {
        map[y * width + x] = classId
      }
    }
  }
}

export function stampClassIdStroke(
  map: Uint16Array,
  width: number,
  height: number,
  from: Point2D,
  to: Point2D,
  brushDiameter: number,
  classId: number
): void {
  if (classId === 0) {
    stampEraseStroke(map, width, height, from, to, brushDiameter)
    return
  }

  if (usesPixelBrushShape(brushDiameter)) {
    forEachBrushStrokeCenter(from.x, from.y, to.x, to.y, (centerX, centerY) => {
      forEachPixelBrushPixel(centerX, centerY, brushDiameter, (x, y) => {
        if (x >= 0 && y >= 0 && x < width && y < height) {
          map[y * width + x] = classId
        }
      })
    })
    return
  }

  stampCapsuleOnClassMap(map, width, height, from, to, brushDiameter / 2, classId)
}

function stampEraseStroke(
  map: Uint16Array,
  width: number,
  height: number,
  from: Point2D,
  to: Point2D,
  brushDiameter: number
): void {
  stampClassIdStroke(map, width, height, from, to, brushDiameter, 0)
}

export function renderSemanticOverlay(
  classMap: Uint16Array,
  width: number,
  height: number,
  classColors: Map<number, string>,
  opacity: number
): ImageData {
  const imageData = new ImageData(width, height)
  const data = imageData.data

  for (let i = 0; i < classMap.length; i++) {
    const classId = classMap[i]
    if (classId === 0) continue
    const color = classColors.get(classId)
    if (!color) continue

    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    const offset = i * 4
    data[offset] = r
    data[offset + 1] = g
    data[offset + 2] = b
    data[offset + 3] = Math.round(opacity * 255)
  }

  return imageData
}
