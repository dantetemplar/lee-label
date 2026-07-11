export interface Point2D {
  x: number
  y: number
}

export interface MaskRegion {
  pixels: Point2D[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

function isForeground(data: Uint8Array, width: number, x: number, y: number): boolean {
  if (x < 0 || y < 0) return false
  const index = y * width + x
  if (index >= data.length) return false
  return data[index] > 0
}

export function findConnectedComponents(
  data: Uint8Array,
  width: number,
  height: number
): MaskRegion[] {
  const visited = new Uint8Array(data.length)
  const components: MaskRegion[] = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x
      if (!data[start] || visited[start]) continue

      const pixels: Point2D[] = []
      let minX = x
      let minY = y
      let maxX = x
      let maxY = y
      const stack = [{ x, y }]

      while (stack.length > 0) {
        const current = stack.pop()!
        const index = current.y * width + current.x
        if (visited[index] || !data[index]) continue
        visited[index] = 1
        pixels.push(current)
        minX = Math.min(minX, current.x)
        minY = Math.min(minY, current.y)
        maxX = Math.max(maxX, current.x)
        maxY = Math.max(maxY, current.y)

        if (current.x > 0) stack.push({ x: current.x - 1, y: current.y })
        if (current.x < width - 1) stack.push({ x: current.x + 1, y: current.y })
        if (current.y > 0) stack.push({ x: current.x, y: current.y - 1 })
        if (current.y < height - 1) stack.push({ x: current.x, y: current.y + 1 })
      }

      components.push({ pixels, bounds: { minX, minY, maxX, maxY } })
    }
  }

  return components.sort((left, right) => right.pixels.length - left.pixels.length)
}

export function extractComponentMask(
  _data: Uint8Array,
  width: number,
  height: number,
  component: MaskRegion
): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (const pixel of component.pixels) {
    mask[pixel.y * width + pixel.x] = 255
  }
  return mask
}

export function findHolePixels(
  data: Uint8Array,
  width: number,
  height: number
): Point2D[] {
  const reachable = new Uint8Array(data.length)
  const queue: number[] = []
  let queueIndex = 0

  const enqueueBackground = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const index = y * width + x
    if (reachable[index] || data[index] > 0) return
    reachable[index] = 1
    queue.push(index)
  }

  for (let x = 0; x < width; x++) {
    enqueueBackground(x, 0)
    enqueueBackground(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    enqueueBackground(0, y)
    enqueueBackground(width - 1, y)
  }

  while (queueIndex < queue.length) {
    const current = queue[queueIndex++]
    const x = current % width
    const y = Math.floor(current / width)
    enqueueBackground(x - 1, y)
    enqueueBackground(x + 1, y)
    enqueueBackground(x, y - 1)
    enqueueBackground(x, y + 1)
  }

  const holes: Point2D[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      if (!data[index] && !reachable[index]) {
        holes.push({ x, y })
      }
    }
  }

  return holes
}

const NEIGHBORS = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 }
]

function findStartPixel(data: Uint8Array, width: number, height: number): Point2D | null {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isForeground(data, width, x, y)) continue
      if (!isForeground(data, width, x, y - 1)) return { x, y }
    }
  }
  return null
}

export function traceOuterBoundary(
  data: Uint8Array,
  width: number,
  height: number
): Point2D[] {
  const start = findStartPixel(data, width, height)
  if (!start) return []

  const boundary: Point2D[] = []
  let current = start
  let direction = 6
  const maxSteps = width * height * 8
  let steps = 0

  do {
    boundary.push({ x: current.x, y: current.y })
    let found = false

    for (let offset = 0; offset < 8; offset++) {
      const dir = (direction + offset) % 8
      const next = {
        x: current.x + NEIGHBORS[dir].x,
        y: current.y + NEIGHBORS[dir].y
      }
      if (!isForeground(data, width, next.x, next.y)) continue
      current = next
      direction = (dir + 6) % 8
      found = true
      break
    }

    if (!found) break
    steps++
  } while ((current.x !== start.x || current.y !== start.y || boundary.length < 3) && steps < maxSteps)

  if (boundary.length >= 2) {
    const first = boundary[0]
    const last = boundary[boundary.length - 1]
    if (first.x === last.x && first.y === last.y) boundary.pop()
  }

  return boundary
}

function pointKey(point: Point2D): string {
  return `${point.x},${point.y}`
}

/** Trace outer boundary on pixel-grid corners (clockwise edge ring). */
export function traceGridBoundary(
  data: Uint8Array,
  width: number,
  height: number
): Point2D[] {
  const next = new Map<string, Point2D>()

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isForeground(data, width, x, y)) continue

      const topLeft = { x, y }
      const topRight = { x: x + 1, y }
      const bottomRight = { x: x + 1, y: y + 1 }
      const bottomLeft = { x, y: y + 1 }

      if (!isForeground(data, width, x, y - 1)) {
        next.set(pointKey(topLeft), topRight)
      }
      if (!isForeground(data, width, x + 1, y)) {
        next.set(pointKey(topRight), bottomRight)
      }
      if (!isForeground(data, width, x, y + 1)) {
        next.set(pointKey(bottomRight), bottomLeft)
      }
      if (!isForeground(data, width, x - 1, y)) {
        next.set(pointKey(bottomLeft), topLeft)
      }
    }
  }

  if (next.size === 0) return []

  const startKey = next.keys().next().value
  if (!startKey) return []

  const [startX, startY] = startKey.split(',').map(Number)
  const start = { x: startX, y: startY }
  const ring: Point2D[] = [start]
  let current = start

  for (let step = 0; step <= next.size; step++) {
    const edge = next.get(pointKey(current))
    if (!edge) break
    if (edge.x === start.x && edge.y === start.y) break
    ring.push(edge)
    current = edge
  }

  return ring
}

/**
 * Step 1 — external contour extraction (OpenCV `findContours` + `RETR_EXTERNAL`).
 * Returns a dense boundary chain; prefers pixel border following, then grid corners.
 */
export function extractExternalContour(
  data: Uint8Array,
  width: number,
  height: number
): Point2D[] {
  const pixelChain = traceOuterBoundary(data, width, height)
  if (pixelChain.length >= 3) return pixelChain

  const gridRing = traceGridBoundary(data, width, height)
  if (gridRing.length >= 3) return gridRing

  return pixelChain
}
