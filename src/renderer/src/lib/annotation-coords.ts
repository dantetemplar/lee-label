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

export function hitTestPolygon(
  x: number,
  y: number,
  points: { x: number; y: number }[]
): boolean {
  if (points.length < 3) return false
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x
    const yi = points[i].y
    const xj = points[j].x
    const yj = points[j].y
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}
