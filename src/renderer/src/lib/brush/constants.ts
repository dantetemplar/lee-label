import { usesPixelBrushShape } from './brush-shapes'

export const DEFAULT_BRUSH_DIAMETER_IMAGE_PX = 40
export const MIN_BRUSH_DIAMETER_IMAGE_PX = 1
export const MAX_BRUSH_DIAMETER_IMAGE_PX = 200
export const BRUSH_SIZE_SLIDER_STEPS = 1000

export function brushSizeToSliderValue(size: number): number {
  const min = MIN_BRUSH_DIAMETER_IMAGE_PX
  const max = MAX_BRUSH_DIAMETER_IMAGE_PX
  const clamped = Math.min(Math.max(size, min), max)
  if (clamped <= min) return 0
  if (clamped >= max) return BRUSH_SIZE_SLIDER_STEPS

  const t = Math.log(clamped / min) / Math.log(max / min)
  return Math.round(t * BRUSH_SIZE_SLIDER_STEPS)
}

export function sliderValueToBrushSize(value: number): number {
  const min = MIN_BRUSH_DIAMETER_IMAGE_PX
  const max = MAX_BRUSH_DIAMETER_IMAGE_PX
  const clamped = Math.min(Math.max(value, 0), BRUSH_SIZE_SLIDER_STEPS)
  if (clamped <= 0) return min
  if (clamped >= BRUSH_SIZE_SLIDER_STEPS) return max

  const t = clamped / BRUSH_SIZE_SLIDER_STEPS
  return Math.round(min * (max / min) ** t)
}

export const SESSION_MASK_OPACITY = 0.6
export const ACTIVE_STROKE_OPACITY = 0.6
export const COMMITTED_MASK_OPACITY = 0.4

export const BRUSH_PREVIEW_FILLED_MAX_DIAMETER_PX = 4
export const BRUSH_PREVIEW_FILLED_OPACITY = 0.8
export const BRUSH_PREVIEW_STROKE_IMAGE_PX = 4
export const BRUSH_PREVIEW_INNER_STROKE_IMAGE_PX = 2
export const BRUSH_PREVIEW_OUTER_OPACITY = 0.8
export const BRUSH_PREVIEW_INNER_OPACITY = 0.4

export { usesPixelBrushShape } from './brush-shapes'

export type BrushPreviewMode = 'filled' | 'ring'

export interface BrushPreviewSettings {
  mode: BrushPreviewMode
  strokeWidthPx: number
  innerStrokeWidthPx: number
  outerOpacity: number
  innerOpacity: number
}

export function getEffectiveBrushDiameter(
  brushDiameterPx: number,
  scale: number,
  maxScale: number,
  shrinkAtMaxZoom: boolean
): number {
  if (!shrinkAtMaxZoom || scale < maxScale - 1e-4) {
    return brushDiameterPx
  }
  return Math.max(MIN_BRUSH_DIAMETER_IMAGE_PX, Math.floor(brushDiameterPx / 2))
}

export function normalizeBrushDiameter(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return MIN_BRUSH_DIAMETER_IMAGE_PX
  return Math.max(MIN_BRUSH_DIAMETER_IMAGE_PX, Math.round(value))
}

export function usesSvgBrushPreview(brushDiameterPx: number): boolean {
  return usesPixelBrushShape(brushDiameterPx)
}

export function getBrushPreviewSettings(brushDiameterPx: number): BrushPreviewSettings {
  if (brushDiameterPx < BRUSH_PREVIEW_FILLED_MAX_DIAMETER_PX) {
    return {
      mode: 'filled',
      strokeWidthPx: 0,
      innerStrokeWidthPx: 0,
      outerOpacity: BRUSH_PREVIEW_FILLED_OPACITY,
      innerOpacity: BRUSH_PREVIEW_FILLED_OPACITY
    }
  }

  const stroke = getBrushPreviewStrokeWidths(brushDiameterPx)
  return {
    mode: 'ring',
    strokeWidthPx: stroke.strokeWidthPx,
    innerStrokeWidthPx: stroke.innerStrokeWidthPx,
    outerOpacity: BRUSH_PREVIEW_OUTER_OPACITY,
    innerOpacity: BRUSH_PREVIEW_INNER_OPACITY
  }
}

export function getBrushPreviewStrokeWidths(brushDiameterPx: number): {
  strokeWidthPx: number
  innerStrokeWidthPx: number
} {
  const strokeWidthPx =
    brushDiameterPx <= 4 ? 1 : brushDiameterPx <= 10 ? 2 : BRUSH_PREVIEW_STROKE_IMAGE_PX

  return {
    strokeWidthPx,
    innerStrokeWidthPx: strokeWidthPx / 2
  }
}
