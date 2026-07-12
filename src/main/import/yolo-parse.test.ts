import { describe, expect, it } from 'vitest'
import { parseClassNames, parseYoloDetectionLine, parseYoloSegmentationLine } from './yolo-parse'

describe('yolo-parse', () => {
  it('parses detection lines into pixel boxes', () => {
    const box = parseYoloDetectionLine('0 0.5 0.5 0.2 0.4', 100, 200)
    expect(box).toEqual({
      classId: 0,
      x: 40,
      y: 60,
      width: 20,
      height: 80
    })
  })

  it('parses segmentation polygons', () => {
    const polygon = parseYoloSegmentationLine('1 0 0 1 0 1 1', 10, 20)
    expect(polygon).toEqual({
      classId: 1,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 20 }
      ]
    })
  })

  it('parses classes.txt and yaml names', () => {
    expect(parseClassNames('person\ncar\n', 'classes.txt')).toEqual(['person', 'car'])
    expect(parseClassNames("names: ['a', 'b']\n", 'data.yaml')).toEqual(['a', 'b'])
    expect(
      parseClassNames(
        `names:
  0: person
  1: bike
path: .
`,
        'data.yaml'
      )
    ).toEqual(['person', 'bike'])
  })
})
