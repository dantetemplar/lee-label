import { describe, expect, it } from 'vitest'
import { decodeClassMap, encodeClassMap } from './semantic-mask-codec'

describe('semantic-mask-codec', () => {
  it('roundtrips a 16-bit class map', () => {
    const width = 4
    const height = 3
    const data = new Uint16Array(width * height)
    data.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])

    const encoded = encodeClassMap(data, width, height)
    const decoded = decodeClassMap(encoded)

    expect(decoded.width).toBe(width)
    expect(decoded.height).toBe(height)
    expect(Array.from(decoded.data)).toEqual(Array.from(data))
  })
})
