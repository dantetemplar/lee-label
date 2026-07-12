export interface YoloDetectionBox {
  classId: number
  x: number
  y: number
  width: number
  height: number
}

export interface YoloPolygon {
  classId: number
  points: { x: number; y: number }[]
}

function parseNumberToken(token: string): number | null {
  const value = Number(token)
  if (!Number.isFinite(value)) return null
  return value
}

/** YOLO detection: `class x_center y_center width height` (normalized 0–1). */
export function parseYoloDetectionLine(
  line: string,
  imageWidth: number,
  imageHeight: number
): YoloDetectionBox | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const parts = trimmed.split(/\s+/)
  if (parts.length < 5) return null

  const classId = parseNumberToken(parts[0]!)
  const xc = parseNumberToken(parts[1]!)
  const yc = parseNumberToken(parts[2]!)
  const nw = parseNumberToken(parts[3]!)
  const nh = parseNumberToken(parts[4]!)
  if (
    classId === null ||
    xc === null ||
    yc === null ||
    nw === null ||
    nh === null ||
    !Number.isInteger(classId) ||
    classId < 0
  ) {
    return null
  }

  const width = nw * imageWidth
  const height = nh * imageHeight
  const x = xc * imageWidth - width / 2
  const y = yc * imageHeight - height / 2

  if (!(width > 0) || !(height > 0)) return null

  return { classId, x, y, width, height }
}

/** YOLO segmentation: `class x1 y1 x2 y2 ...` (normalized 0–1). */
export function parseYoloSegmentationLine(
  line: string,
  imageWidth: number,
  imageHeight: number
): YoloPolygon | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const parts = trimmed.split(/\s+/)
  if (parts.length < 7 || parts.length % 2 === 0) return null

  const classId = parseNumberToken(parts[0]!)
  if (classId === null || !Number.isInteger(classId) || classId < 0) return null

  const points: { x: number; y: number }[] = []
  for (let i = 1; i < parts.length; i += 2) {
    const nx = parseNumberToken(parts[i]!)
    const ny = parseNumberToken(parts[i + 1]!)
    if (nx === null || ny === null) return null
    points.push({ x: nx * imageWidth, y: ny * imageHeight })
  }

  if (points.length < 3) return null
  return { classId, points }
}

function stripYamlScalar(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

/** Parse Ultralytics `names` from classes.txt or data.yaml / dataset.yaml. */
export function parseClassNames(content: string, filePath: string): string[] {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.txt')) {
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
  }

  const inlineList = content.match(/names:\s*\[([^\]]*)\]/)
  if (inlineList) {
    return inlineList[1]!
      .split(',')
      .map((item) => stripYamlScalar(item))
      .filter((item) => item.length > 0)
  }

  const namesHeader = content.match(/^names:\s*$/m)
  if (!namesHeader || namesHeader.index === undefined) return []

  const after = content.slice(namesHeader.index + namesHeader[0].length)
  const lines = after.split(/\r?\n/)
  const byIndex: string[] = []
  const sequential: string[] = []

  for (const line of lines) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    if (/^\S/.test(line)) break

    const dash = line.match(/^\s*-\s+(.+)$/)
    if (dash) {
      sequential.push(stripYamlScalar(dash[1]!))
      continue
    }

    const numbered = line.match(/^\s*(\d+)\s*:\s*(.+)$/)
    if (numbered) {
      byIndex[Number(numbered[1])] = stripYamlScalar(numbered[2]!)
    }
  }

  if (sequential.length > 0) return sequential
  return byIndex.filter((name): name is string => typeof name === 'string' && name.length > 0)
}
