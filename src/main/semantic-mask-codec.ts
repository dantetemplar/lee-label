import { decode, encode } from 'fast-png'

export function encodeClassMap(data: Uint16Array, width: number, height: number): Buffer {
  if (data.length !== width * height) {
    throw new Error(`Class map length ${data.length} does not match ${width}x${height}`)
  }

  const encoded = encode({
    width,
    height,
    data,
    depth: 16,
    channels: 1
  })

  return Buffer.from(encoded)
}

export function decodeClassMap(
  buffer: Buffer
): { data: Uint16Array; width: number; height: number } {
  const png = decode(buffer)
  if (png.depth !== 16 || png.channels !== 1) {
    throw new Error(`Expected 16-bit grayscale PNG, got depth=${png.depth} channels=${png.channels}`)
  }

  const width = png.width
  const height = png.height
  const data = new Uint16Array(png.data.buffer, png.data.byteOffset, width * height)

  return { data, width, height }
}
