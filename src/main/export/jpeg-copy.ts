import sharp from 'sharp'

export async function writeJpegCopy(
  sourcePath: string,
  destPath: string,
  quality: number
): Promise<void> {
  const q = Math.min(100, Math.max(1, Math.round(quality)))
  await sharp(sourcePath).withMetadata().jpeg({ quality: q, mozjpeg: false }).toFile(destPath)
}
