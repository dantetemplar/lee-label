import type { Point2D } from '../../../../shared/geometry'

export type { Point2D }

export interface MaskRegionBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface MaskComponent {
  label: number
  pixelCount: number
  bounds: MaskRegionBounds
}

export interface LabeledComponents {
  labels: Int32Array
  components: MaskComponent[]
}

export interface MaskRegion {
  pixels: Point2D[]
  bounds: MaskRegionBounds
  pixelCount?: number
  label?: number
}

function isForeground(data: Uint8Array, width: number, x: number, y: number): boolean {
  if (x < 0 || y < 0) return false
  const index = y * width + x
  if (index >= data.length) return false
  return data[index] > 0
}

/** 4-connected foreground labeling without per-neighbor object allocation. */
export function labelConnectedComponents(
  data: Uint8Array,
  width: number,
  height: number
): LabeledComponents {
  const labels = new Int32Array(data.length)
  const components: MaskComponent[] = []
  const stack = new Int32Array(data.length)
  let nextLabel = 0

  for (let start = 0; start < data.length; start++) {
    if (!data[start] || labels[start] !== 0) continue

    nextLabel++
    let pixelCount = 0
    let minX = start % width
    let maxX = minX
    let minY = (start / width) | 0
    let maxY = minY
    let sp = 0

    // Mark on push so each index is stacked at most once (stack length <= N).
    // Pushing unlabeled neighbors repeatedly overflows a length-N stack and
    // silently drops indices on TypedArrays — false islands on cropped masks.
    labels[start] = nextLabel
    stack[sp++] = start

    while (sp > 0) {
      const index = stack[--sp]
      pixelCount++

      const x = index % width
      const y = (index / width) | 0
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      const tryPush = (ni: number): void => {
        if (labels[ni] !== 0 || !data[ni]) return
        labels[ni] = nextLabel
        stack[sp++] = ni
      }

      if (x > 0) tryPush(index - 1)
      if (x < width - 1) tryPush(index + 1)
      if (y > 0) tryPush(index - width)
      if (y < height - 1) tryPush(index + width)
    }

    components.push({
      label: nextLabel,
      pixelCount,
      bounds: { minX, minY, maxX, maxY }
    })
  }

  components.sort((left, right) => right.pixelCount - left.pixelCount)
  return { labels, components }
}

export function collectComponentPixels(
  labels: Int32Array,
  width: number,
  component: MaskComponent
): Point2D[] {
  const pixels: Point2D[] = new Array(component.pixelCount)
  let count = 0
  const { minX, minY, maxX, maxY } = component.bounds
  const label = component.label

  for (let y = minY; y <= maxY; y++) {
    const row = y * width
    for (let x = minX; x <= maxX; x++) {
      if (labels[row + x] === label) {
        pixels[count++] = { x, y }
      }
    }
  }

  if (count !== pixels.length) pixels.length = count
  return pixels
}

export function extractLabeledComponentMask(
  labels: Int32Array,
  width: number,
  height: number,
  label: number
): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === label) mask[i] = 255
  }
  return mask
}

export function findConnectedComponents(
  data: Uint8Array,
  width: number,
  height: number
): MaskRegion[] {
  const { labels, components } = labelConnectedComponents(data, width, height)
  return components.map((component) => ({
    label: component.label,
    pixelCount: component.pixelCount,
    bounds: component.bounds,
    pixels: collectComponentPixels(labels, width, component)
  }))
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

/** Find enclosed background components (holes). Background is 4-connected. */
export function findHoleComponents(
  data: Uint8Array,
  width: number,
  height: number,
  minPixels: number
): Array<{ pixels: Point2D[]; bounds: MaskRegionBounds }> {
  const reachable = new Uint8Array(data.length)
  const queue = new Int32Array(data.length)
  let head = 0
  let tail = 0

  const enqueueBackground = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const index = y * width + x
    if (reachable[index] || data[index] > 0) return
    reachable[index] = 1
    queue[tail++] = index
  }

  for (let x = 0; x < width; x++) {
    enqueueBackground(x, 0)
    enqueueBackground(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    enqueueBackground(0, y)
    enqueueBackground(width - 1, y)
  }

  while (head < tail) {
    const current = queue[head++]
    const x = current % width
    const y = (current / width) | 0
    enqueueBackground(x - 1, y)
    enqueueBackground(x + 1, y)
    enqueueBackground(x, y - 1)
    enqueueBackground(x, y + 1)
  }

  const holes: Array<{ pixels: Point2D[]; bounds: MaskRegionBounds }> = []
  const visited = reachable

  for (let start = 0; start < data.length; start++) {
    if (data[start] > 0 || visited[start]) continue

    const pixels: Point2D[] = []
    let minX = start % width
    let maxX = minX
    let minY = (start / width) | 0
    let maxY = minY
    head = 0
    tail = 0
    queue[tail++] = start
    visited[start] = 1

    while (head < tail) {
      const index = queue[head++]
      const x = index % width
      const y = (index / width) | 0
      pixels.push({ x, y })
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      const tryVisit = (nx: number, ny: number): void => {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return
        const nIndex = ny * width + nx
        if (visited[nIndex] || data[nIndex] > 0) return
        visited[nIndex] = 1
        queue[tail++] = nIndex
      }

      tryVisit(x - 1, y)
      tryVisit(x + 1, y)
      tryVisit(x, y - 1)
      tryVisit(x, y + 1)
    }

    if (pixels.length >= minPixels) {
      holes.push({ pixels, bounds: { minX, minY, maxX, maxY } })
    }
  }

  return holes
}

export function findHolePixels(
  data: Uint8Array,
  width: number,
  height: number
): Point2D[] {
  const holes = findHoleComponents(data, width, height, 1)
  const pixels: Point2D[] = []
  for (const hole of holes) {
    for (const pixel of hole.pixels) pixels.push(pixel)
  }
  return pixels
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

function traceOuterBoundary(
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

export function extractGridContour(
  data: Uint8Array,
  width: number,
  height: number
): Point2D[] {
  const gridRing = traceGridBoundary(data, width, height)
  if (gridRing.length >= 3) return gridRing
  return traceOuterBoundary(data, width, height)
}
