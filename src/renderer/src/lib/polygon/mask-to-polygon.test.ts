import { describe, expect, it } from 'vitest'
import { POLYGON_SIMPLIFICATION } from '../../../../shared/segmentation'
import { maskToPolygon } from './mask-to-polygon'
import { isSimplePolygon } from './validate'

function rasterizeCapsule(
  width: number,
  height: number,
  fromX: number,
  toX: number,
  centerY: number,
  radius: number
): Uint8Array {
  const data = new Uint8Array(width * height)
  const radiusSquared = radius * radius

  for (let x = fromX; x <= toX; x++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radiusSquared) continue
        const px = x + dx
        const py = centerY + dy
        if (px < 0 || py < 0 || px >= width || py >= height) continue
        data[py * width + px] = 255
      }
    }
  }

  return data
}

function rasterizeCurvedStroke(width: number, height: number, radius: number): Uint8Array {
  const data = new Uint8Array(width * height)
  const radiusSquared = radius * radius

  for (let x = 30; x <= 270; x++) {
    const t = (x - 30) / 240
    const y = Math.round(100 + Math.sin(t * Math.PI) * 25)
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radiusSquared) continue
        const px = x + dx
        const py = y + dy
        if (px < 0 || py < 0 || px >= width || py >= height) continue
        data[py * width + px] = 255
      }
    }
  }

  return data
}

describe('maskToPolygon', () => {
  it('polygonizes a straight brush capsule', () => {
    const width = 300
    const height = 200
    const mask = rasterizeCapsule(width, height, 40, 260, 100, 20)
    const polygon = maskToPolygon(mask, width, height, POLYGON_SIMPLIFICATION)

    expect(polygon).not.toBeNull()
    expect(polygon!.length).toBe(38)
    expect(isSimplePolygon(polygon!)).toBe(true)
  })

  it('polygonizes a curved brush stroke', () => {
    const width = 300
    const height = 200
    const mask = rasterizeCurvedStroke(width, height, 20)
    const polygon = maskToPolygon(mask, width, height, POLYGON_SIMPLIFICATION)

    expect(polygon).not.toBeNull()
    expect(polygon!.length).toBe(110)
    expect(isSimplePolygon(polygon!)).toBe(true)
  })

  it('returns null for an empty mask', () => {
    const mask = new Uint8Array(100)
    expect(maskToPolygon(mask, 10, 10, POLYGON_SIMPLIFICATION)).toBeNull()
  })
})
