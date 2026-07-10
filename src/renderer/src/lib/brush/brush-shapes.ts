export const PIXEL_BRUSH_MAX_SIZE = 3

export function usesPixelBrushShape(brushSize: number): boolean {
  return brushSize >= 1 && brushSize <= PIXEL_BRUSH_MAX_SIZE
}

export function forEachLinePixel(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fn: (x: number, y: number) => void
): void {
  let x = x0
  let y = y0
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  while (true) {
    fn(x, y)
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
}

export function forEachPixelBrushPixel(
  centerX: number,
  centerY: number,
  brushSize: number,
  fn: (x: number, y: number) => void
): void {
  if (brushSize === 1) {
    fn(centerX, centerY)
    return
  }

  if (brushSize === 2) {
    const originX = centerX - 1
    const originY = centerY - 1
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        fn(originX + dx, originY + dy)
      }
    }
    return
  }

  if (brushSize === 3) {
    fn(centerX, centerY)
    fn(centerX - 1, centerY)
    fn(centerX + 1, centerY)
    fn(centerX, centerY - 1)
    fn(centerX, centerY + 1)
  }
}

export function forEachBrushStrokeCenter(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  fn: (centerX: number, centerY: number) => void
): void {
  forEachLinePixel(fromX, fromY, toX, toY, fn)
}

export function getPixelBrushBounds(
  centerX: number,
  centerY: number,
  brushSize: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (brushSize === 1) {
    return { minX: centerX, minY: centerY, maxX: centerX, maxY: centerY }
  }

  if (brushSize === 2) {
    return { minX: centerX - 1, minY: centerY - 1, maxX: centerX, maxY: centerY }
  }

  return { minX: centerX - 1, minY: centerY - 1, maxX: centerX + 1, maxY: centerY + 1 }
}

export function expandPixelBrushStrokeBounds(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  brushSize: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  forEachBrushStrokeCenter(fromX, fromY, toX, toY, (centerX, centerY) => {
    const bounds = getPixelBrushBounds(centerX, centerY, brushSize)
    minX = Math.min(minX, bounds.minX)
    minY = Math.min(minY, bounds.minY)
    maxX = Math.max(maxX, bounds.maxX)
    maxY = Math.max(maxY, bounds.maxY)
  })

  return { minX, minY, maxX, maxY }
}
