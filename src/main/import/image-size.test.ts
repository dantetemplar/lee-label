import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readImageSize } from './image-size'

describe('readImageSize', () => {
  it('reads png dimensions from header', () => {
    const dir = join(tmpdir(), `lee-label-imgsize-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, 'tiny.png')
    // 1x1 PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
    writeFileSync(filePath, png)
    try {
      expect(readImageSize(filePath)).toEqual({ width: 1, height: 1 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
