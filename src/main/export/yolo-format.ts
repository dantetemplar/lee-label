/** Pixel rectangle → YOLO detection line (`class xc yc w h`, normalized). */
export function formatYoloDetectionLine(
  classIndex: number,
  rect: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
): string | null {
  if (!(imageWidth > 0) || !(imageHeight > 0)) return null
  if (!(rect.width > 0) || !(rect.height > 0)) return null

  const xc = (rect.x + rect.width / 2) / imageWidth
  const yc = (rect.y + rect.height / 2) / imageHeight
  const nw = rect.width / imageWidth
  const nh = rect.height / imageHeight

  if (![xc, yc, nw, nh].every((value) => Number.isFinite(value))) return null

  return `${classIndex} ${fmt(xc)} ${fmt(yc)} ${fmt(nw)} ${fmt(nh)}`
}

/** Pixel polygon → YOLO segmentation line (`class x1 y1 x2 y2 …`, normalized). */
export function formatYoloSegmentationLine(
  classIndex: number,
  points: { x: number; y: number }[],
  imageWidth: number,
  imageHeight: number
): string | null {
  if (!(imageWidth > 0) || !(imageHeight > 0)) return null
  if (points.length < 3) return null

  const coords: string[] = []
  for (const point of points) {
    const nx = point.x / imageWidth
    const ny = point.y / imageHeight
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null
    coords.push(fmt(nx), fmt(ny))
  }

  return `${classIndex} ${coords.join(' ')}`
}

function fmt(value: number): string {
  const clamped = Math.min(1, Math.max(0, value))
  return Number(clamped.toFixed(6)).toString()
}
