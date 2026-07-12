import { describe, expect, it } from 'vitest'
import { labelConnectedComponents } from './contour-trace'
import { analyzeMaskTopology } from './validate'

describe('labelConnectedComponents', () => {
  it('keeps a solid rectangle as one component on a tight buffer', () => {
    // Old mark-on-pop DFS overflowed a length-N stack via duplicate pushes and
    // split solid masks into false islands (seen on topology crop buffers).
    const width = 48
    const height = 36
    const data = new Uint8Array(width * height).fill(255)
    const { components } = labelConnectedComponents(data, width, height)
    expect(components).toHaveLength(1)
    expect(components[0].pixelCount).toBe(width * height)
    expect(analyzeMaskTopology(data, width, height).valid).toBe(true)
  })
})
