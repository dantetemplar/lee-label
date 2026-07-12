import { describe, expect, it } from 'vitest'
import { toYoloExportPaths } from './yolo-ultralytics'

describe('toYoloExportPaths', () => {
  it('does not double-nest a leading images/ folder', () => {
    expect(toYoloExportPaths('images/01_1_000003.jpg', false)).toEqual({
      imageRel: 'images/01_1_000003.jpg',
      labelRel: 'labels/01_1_000003.txt'
    })
  })

  it('preserves nested dirs under images/ and labels/', () => {
    expect(toYoloExportPaths('images/train/a.png', true)).toEqual({
      imageRel: 'images/train/a.jpg',
      labelRel: 'labels/train/a.txt'
    })
  })

  it('wraps paths without images/ prefix', () => {
    expect(toYoloExportPaths('train/a.jpg', false)).toEqual({
      imageRel: 'images/train/a.jpg',
      labelRel: 'labels/train/a.txt'
    })
  })
})
