import { describe, expect, it } from 'vitest'
import { formatYoloDetectionLine, formatYoloSegmentationLine } from './yolo-format'

describe('yolo-format', () => {
  it('formats detection lines', () => {
    const line = formatYoloDetectionLine(0, { x: 40, y: 60, width: 20, height: 80 }, 100, 200)
    expect(line).toBe('0 0.5 0.5 0.2 0.4')
  })

  it('formats segmentation lines', () => {
    const line = formatYoloSegmentationLine(
      1,
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 20 }
      ],
      10,
      20
    )
    expect(line).toBe('1 0 0 1 0 1 1')
  })
})
