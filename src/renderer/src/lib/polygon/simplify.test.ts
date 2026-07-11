import { describe, expect, it } from 'vitest'
import { approxPolyDPFromSettings } from './simplify'

describe('simplify', () => {
  it('simplifies a noisy rectangle contour', () => {
    const contour = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 1, y: 3 },
      { x: 0, y: 3 },
      { x: 0, y: 2 },
      { x: 0, y: 1 }
    ]

    const simplified = approxPolyDPFromSettings(contour, { epsilonRatio: 0.05 })
    expect(simplified.length).toBeLessThan(contour.length)
    expect(simplified.length).toBeGreaterThanOrEqual(4)
  })
})
