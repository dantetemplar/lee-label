import { openSync, readSync, closeSync } from 'fs'

export interface ImageDimensions {
  width: number
  height: number
}

function readHeader(filePath: string, length: number): Buffer | null {
  let fd: number | undefined
  try {
    fd = openSync(filePath, 'r')
    const buffer = Buffer.alloc(length)
    const bytesRead = readSync(fd, buffer, 0, length, 0)
    return bytesRead > 0 ? buffer.subarray(0, bytesRead) : null
  } catch {
    return null
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

function sizeFromPng(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24) return null
  if (buffer.toString('ascii', 1, 4) !== 'PNG') return null
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  }
}

function sizeFromGif(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 10) return null
  const header = buffer.toString('ascii', 0, 6)
  if (header !== 'GIF87a' && header !== 'GIF89a') return null
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8)
  }
}

function sizeFromBmp(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 26) return null
  if (buffer.toString('ascii', 0, 2) !== 'BM') return null
  return {
    width: Math.abs(buffer.readInt32LE(18)),
    height: Math.abs(buffer.readInt32LE(22))
  }
}

function sizeFromWebp(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 30) return null
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') return null
  const chunk = buffer.toString('ascii', 12, 16)
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    }
  }
  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    }
  }
  if (chunk === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21)
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    }
  }
  return null
}

function sizeFromJpeg(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null

  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buffer[offset + 1]!
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2
      continue
    }
    const size = buffer.readUInt16BE(offset + 2)
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      }
    }
    offset += 2 + size
  }
  return null
}

/** Reads only file headers — much faster than decoding via nativeImage. */
export function readImageSize(filePath: string): ImageDimensions | null {
  const buffer = readHeader(filePath, 128 * 1024)
  if (!buffer || buffer.length < 24) return null

  if (buffer[0] === 0xff && buffer[1] === 0xd8) return sizeFromJpeg(buffer)
  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return sizeFromPng(buffer)
  if (buffer.toString('ascii', 0, 3) === 'GIF') return sizeFromGif(buffer)
  if (buffer.toString('ascii', 0, 2) === 'BM') return sizeFromBmp(buffer)
  if (buffer.toString('ascii', 0, 4) === 'RIFF') return sizeFromWebp(buffer)
  return null
}
