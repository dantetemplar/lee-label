import {
  forEachBrushStrokeCenter,
  forEachPixelBrushPixel
} from './brush/brush-shapes'

export function computeMaskBounds(
  data: Uint8Array,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] > 0) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) return null

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  }
}

export function cropMaskBitmap(
  data: Uint8Array,
  fullWidth: number,
  bounds: { x: number; y: number; width: number; height: number }
): Uint8Array {
  const cropped = new Uint8Array(bounds.width * bounds.height)
  for (let y = 0; y < bounds.height; y++) {
    for (let x = 0; x < bounds.width; x++) {
      const srcX = bounds.x + x
      const srcY = bounds.y + y
      cropped[y * bounds.width + x] = data[srcY * fullWidth + srcX]
    }
  }
  return cropped
}

export function expandMaskBitmap(
  data: Uint8Array,
  croppedWidth: number,
  bounds: { x: number; y: number; width: number; height: number },
  fullWidth: number,
  fullHeight: number
): Uint8Array {
  const full = new Uint8Array(fullWidth * fullHeight)
  for (let y = 0; y < bounds.height; y++) {
    for (let x = 0; x < bounds.width; x++) {
      const destX = bounds.x + x
      const destY = bounds.y + y
      if (destX >= 0 && destY >= 0 && destX < fullWidth && destY < fullHeight) {
        full[destY * fullWidth + destX] = data[y * croppedWidth + x]
      }
    }
  }
  return full
}

export function pointInCapsule(
  x: number,
  y: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number
): boolean {
  const abX = to.x - from.x
  const abY = to.y - from.y
  const abLen2 = abX * abX + abY * abY
  const h =
    abLen2 < 1e-6
      ? 0
      : Math.max(0, Math.min(1, ((x - from.x) * abX + (y - from.y) * abY) / abLen2))
  const closestX = from.x + h * abX
  const closestY = from.y + h * abY
  const dx = x - closestX
  const dy = y - closestY
  return dx * dx + dy * dy <= radius * radius
}

export function eraseCapsuleFromMaskData(
  data: Uint8Array,
  bounds: { x: number; y: number; width: number; height: number },
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number
): boolean {
  const minLocalX = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius - bounds.x))
  const maxLocalX = Math.min(bounds.width - 1, Math.ceil(Math.max(from.x, to.x) + radius - bounds.x))
  const minLocalY = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius - bounds.y))
  const maxLocalY = Math.min(bounds.height - 1, Math.ceil(Math.max(from.y, to.y) + radius - bounds.y))

  if (minLocalX > maxLocalX || minLocalY > maxLocalY) return false

  let changed = false
  for (let localY = minLocalY; localY <= maxLocalY; localY++) {
    for (let localX = minLocalX; localX <= maxLocalX; localX++) {
      const imageX = bounds.x + localX
      const imageY = bounds.y + localY
      if (!pointInCapsule(imageX, imageY, from, to, radius)) continue
      const index = localY * bounds.width + localX
      if (data[index] > 0) {
        data[index] = 0
        changed = true
      }
    }
  }

  return changed
}

export function erasePixelBrushStrokeFromMaskData(
  data: Uint8Array,
  bounds: { x: number; y: number; width: number; height: number },
  from: { x: number; y: number },
  to: { x: number; y: number },
  brushSize: number
): boolean {
  let changed = false

  forEachBrushStrokeCenter(from.x, from.y, to.x, to.y, (centerX, centerY) => {
    forEachPixelBrushPixel(centerX, centerY, brushSize, (imageX, imageY) => {
      const localX = imageX - bounds.x
      const localY = imageY - bounds.y
      if (localX < 0 || localY < 0 || localX >= bounds.width || localY >= bounds.height) return

      const index = localY * bounds.width + localX
      if (data[index] > 0) {
        data[index] = 0
        changed = true
      }
    })
  })

  return changed
}

export function tightenMaskBitmap<T extends { bounds: { x: number; y: number; width: number; height: number }; data: Uint8Array }>(
  shape: T,
  imageWidth: number,
  imageHeight: number
): T | null {
  const full = expandMaskBitmap(shape.data, shape.bounds.width, shape.bounds, imageWidth, imageHeight)
  const bounds = computeMaskBounds(full, imageWidth, imageHeight)
  if (!bounds) return null

  return {
    ...shape,
    bounds,
    data: cropMaskBitmap(full, imageWidth, bounds)
  }
}
