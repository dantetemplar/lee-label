export interface ViewTransform {
  panX: number
  panY: number
  scale: number
  fitScale: number
  maxScale: number
}

export function viewportToImage(
  clientX: number,
  clientY: number,
  viewportRect: DOMRect,
  transform: ViewTransform
): { x: number; y: number } {
  const localX = clientX - viewportRect.left
  const localY = clientY - viewportRect.top
  return {
    x: (localX - transform.panX) / transform.scale,
    y: (localY - transform.panY) / transform.scale
  }
}

export function imageToViewport(
  imageX: number,
  imageY: number,
  transform: ViewTransform
): { x: number; y: number } {
  return {
    x: imageX * transform.scale + transform.panX,
    y: imageY * transform.scale + transform.panY
  }
}

export function clampToImage(
  x: number,
  y: number,
  imageWidth: number,
  imageHeight: number
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, 0), imageWidth),
    y: Math.min(Math.max(y, 0), imageHeight)
  }
}

export function snapPointToImagePixel(
  point: { x: number; y: number },
  imageWidth: number,
  imageHeight: number
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(Math.round(point.x), 0), imageWidth),
    y: Math.min(Math.max(Math.round(point.y), 0), imageHeight)
  }
}

export function panFromScreenDrag(
  originPanX: number,
  originPanY: number,
  screenDx: number,
  screenDy: number,
  scale: number
): { panX: number; panY: number } {
  return {
    panX: originPanX + Math.round(screenDx / scale) * scale,
    panY: originPanY + Math.round(screenDy / scale) * scale
  }
}

export function snapPanToImagePixelGrid(
  panX: number,
  panY: number,
  scale: number
): { panX: number; panY: number } {
  return {
    panX: Math.round(panX / scale) * scale,
    panY: Math.round(panY / scale) * scale
  }
}

export function hitTestRectangle(
  x: number,
  y: number,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  )
}

export function hitTestMaskBounds(
  x: number,
  y: number,
  bounds: { x: number; y: number; width: number; height: number }
): boolean {
  return hitTestRectangle(x, y, bounds)
}

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
