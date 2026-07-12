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

export type RectCorner = 'nw' | 'ne' | 'sw' | 'se'

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

export function rectangleCornerPoints(rect: {
  x: number
  y: number
  width: number
  height: number
}): Record<RectCorner, { x: number; y: number }> {
  return {
    nw: { x: rect.x, y: rect.y },
    ne: { x: rect.x + rect.width, y: rect.y },
    sw: { x: rect.x, y: rect.y + rect.height },
    se: { x: rect.x + rect.width, y: rect.y + rect.height }
  }
}

export function oppositeRectCorner(corner: RectCorner): RectCorner {
  switch (corner) {
    case 'nw':
      return 'se'
    case 'ne':
      return 'sw'
    case 'sw':
      return 'ne'
    case 'se':
      return 'nw'
  }
}

export function normalizeRectFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number }
): { x: number; y: number; width: number; height: number } {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  }
}

export function rectanglesIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function hitTestRectangleCorner(
  x: number,
  y: number,
  rect: { x: number; y: number; width: number; height: number },
  hitRadius: number
): RectCorner | null {
  const corners = rectangleCornerPoints(rect)
  let best: RectCorner | null = null
  let bestDist = hitRadius
  for (const corner of Object.keys(corners) as RectCorner[]) {
    const point = corners[corner]
    const dist = Math.hypot(point.x - x, point.y - y)
    if (dist <= bestDist) {
      best = corner
      bestDist = dist
    }
  }
  return best
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
