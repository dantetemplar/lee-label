import type { PolygonSimplificationSettings } from '../../../../shared/segmentation'
import type { Point2D } from '../../../../shared/geometry'
import { polygonizeMask } from './polygonize'

export function maskToPolygon(
  data: Uint8Array,
  width: number,
  height: number,
  settings: PolygonSimplificationSettings
): Point2D[] | null {
  return polygonizeMask(data, width, height, settings)
}
