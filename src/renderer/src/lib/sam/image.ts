import type { RawImageData } from './types'

function filePathFromImageSrc(src: string): string | null {
  try {
    const url = new URL(src)
    if (url.protocol === 'local-image:') {
      const path = url.searchParams.get('path')
      return path ? decodeURIComponent(path) : null
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Read RGBA pixels for SAM encoding via main-process file read.
 * Avoids canvas taint and Chromium's lack of fetch() for custom schemes.
 */
export async function imageToRawData(image: HTMLImageElement): Promise<RawImageData> {
  const src = image.currentSrc || image.src
  if (!src) throw new Error('Image has no src')

  const filePath = filePathFromImageSrc(src)
  if (!filePath) {
    throw new Error('SAM encoding requires a local-image:// source')
  }

  // Click coords / overlay use naturalWidth×naturalHeight. Force encode to the
  // same size so createImageBitmap EXIF/orientation quirks cannot desync them.
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (width <= 0 || height <= 0) {
    throw new Error('Image has no natural dimensions')
  }

  const buffer = await window.api.files.readBinaryFile(filePath)
  const blob = new Blob([buffer])
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to create canvas context')
    ctx.drawImage(bitmap, 0, 0, width, height)
    const imageData = ctx.getImageData(0, 0, width, height)
    return {
      data: imageData.data,
      width,
      height
    }
  } finally {
    bitmap.close()
  }
}

/**
 * Scale image-pixel coordinates to 1024x1024 model space.
 * SAM preprocessing scales the longest edge to 1024 and zero-pads the short edge.
 */
export function imageToModelCoords(
  imageX: number,
  imageY: number,
  imageWidth: number,
  imageHeight: number
): [number, number] {
  const scale = 1024 / Math.max(imageWidth, imageHeight)
  return [imageX * scale, imageY * scale]
}
