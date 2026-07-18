import { extractLabeledComponentMask, labelConnectedComponents } from './contour-trace'
import { binarizeMask } from './validate'

export function repairMaskTopology(data: Uint8Array, width: number, height: number): Uint8Array {
  const binary = binarizeMask(data)
  const { labels, components } = labelConnectedComponents(binary, width, height)
  if (components.length === 0) return new Uint8Array(data.length)

  let mask = extractLabeledComponentMask(labels, width, height, components[0].label)
  mask = fillHoles(mask, width, height)
  return mask
}

function fillHoles(data: Uint8Array, width: number, height: number): Uint8Array {
  const repaired = new Uint8Array(data)
  const reachable = new Uint8Array(data.length)
  const queue = new Int32Array(data.length)
  let head = 0
  let tail = 0

  const enqueueBackground = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const index = y * width + x
    if (reachable[index] || repaired[index] > 0) return
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

  for (let i = 0; i < repaired.length; i++) {
    if (!repaired[i] && !reachable[i]) {
      repaired[i] = 255
    }
  }

  return repaired
}
