import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { writeJpegCopy } from './jpeg-copy'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

describe('sharp', () => {
  it('loads native bindings', () => {
    expect(sharp.versions.sharp).toMatch(/^\d/)
    expect(sharp.versions.vips).toBeTruthy()
  })

  it('reads png metadata', async () => {
    const meta = await sharp(TINY_PNG).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(1)
    expect(meta.height).toBe(1)
  })

  it('converts png to jpeg via writeJpegCopy', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lee-label-sharp-'))
    const sourcePath = join(dir, 'source.png')
    const destPath = join(dir, 'dest.jpg')
    try {
      await writeFile(sourcePath, TINY_PNG)
      await writeJpegCopy(sourcePath, destPath, 90)

      const jpeg = await readFile(destPath)
      expect(jpeg[0]).toBe(0xff)
      expect(jpeg[1]).toBe(0xd8)

      const meta = await sharp(destPath).metadata()
      expect(meta.format).toBe('jpeg')
      expect(meta.width).toBe(1)
      expect(meta.height).toBe(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('converts multiple images concurrently', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lee-label-sharp-'))
    try {
      await Promise.all(
        Array.from({ length: 8 }, async (_, i) => {
          const sourcePath = join(dir, `source-${i}.png`)
          const destPath = join(dir, `dest-${i}.jpg`)
          await writeFile(sourcePath, TINY_PNG)
          await writeJpegCopy(sourcePath, destPath, 85)
          const meta = await sharp(destPath).metadata()
          expect(meta.format).toBe('jpeg')
        })
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
