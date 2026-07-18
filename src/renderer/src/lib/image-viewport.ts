import { createSignal, type Accessor } from 'solid-js'
import type { ImageBounds, ViewTransform } from './annotation-coords'
import { panFromScreenDrag, snapPanToImagePixelGrid } from './annotation-coords'

export const MAX_SCALE_MULTIPLIER = 16
/**
 * Mouse-wheel notches: |deltaY| is typically 100 or 120 (or multiples).
 * Intensity chosen so one notch ≈ ±10% (exp(120 * 0.0008) ≈ 1.10).
 */
export const ZOOM_WHEEL_INTENSITY = 0.0008
/**
 * Chromium encodes trackpad pinch as wheel+ctrlKey with percent-scale deltaY.
 * Mapping: exp(-dy/100).
 */
export const ZOOM_PINCH_DIVISOR = 100
/**
 * Ignore tiny pinch deltas — trackpad noise / finger settle causes ±0.2–0.7
 * reversals that read as trembling.
 */
export const ZOOM_PINCH_DEADZONE = 1
/** Per-event pinch scale clamp (Chrome PDF gesture_detector). */
export const ZOOM_PINCH_FACTOR_MIN = 0.75
export const ZOOM_PINCH_FACTOR_MAX = 1.25
/**
 * Ctrl+touchpad scroll also sets ctrlKey but emits large pixel-like deltas.
 * Use a low intensity so continuous events stay proportional (no clamp saturation).
 * dy=100 → ~2%, dy=200 → ~4%.
 */
export const ZOOM_CTRL_SCROLL_INTENSITY = 0.0002
/**
 * Linux pinch: wheelDeltaY is always ±120 while deltaY stays small/fractional.
 * Ctrl+touchpad scroll: wheelDeltaY ≈ |deltaY| (not locked to 120).
 */
export const ZOOM_PINCH_WHEEL_DELTA = 120
export const FIT_PADDING = 16
/** Wheel events closer than this inherit the burst's mouse/trackpad classification. */
export const WHEEL_BURST_GAP_MS = 80

type WheelDeltaEvent = WheelEvent & { wheelDeltaX?: number; wheelDeltaY?: number }

/**
 * Best-effort mouse-wheel vs trackpad classification.
 *
 * Do NOT trust wheelDeltaY % 120 alone: on Linux, trackpad pinch reports wDY=±120
 * while deltaY is a small fractional percent-scale value.
 * Real mouse notches: large integer |deltaY| in {100,120,…}.
 */
export function classifyMouseWheel(event: WheelEvent): boolean {
  if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return true

  const absY = Math.abs(event.deltaY)
  const absX = Math.abs(event.deltaX)

  // Discrete mouse notches are large integer pixel deltas.
  if (absY >= 100 && Number.isInteger(event.deltaY) && absX === 0) return true
  if (absX >= 100 && Number.isInteger(event.deltaX) && absY === 0) return true

  // Fractional or small deltas are trackpad (scroll or pinch).
  if (!Number.isInteger(event.deltaY) || !Number.isInteger(event.deltaX)) return false
  if (absY > 0 && absY < 100) return false
  if (absX > 0 && absX < 100) return false

  // Diagonal motion is almost always a trackpad.
  if (event.deltaX !== 0 && event.deltaY !== 0) return false

  const e = event as WheelDeltaEvent
  if (typeof e.wheelDeltaY === 'number' && e.wheelDeltaY !== 0 && absY >= 100) {
    return e.wheelDeltaY % 120 === 0
  }
  if (typeof e.wheelDeltaX === 'number' && e.wheelDeltaX !== 0 && absX >= 100) {
    return e.wheelDeltaX % 120 === 0
  }

  return false
}

/**
 * True trackpad pinch (vs Ctrl+scroll / Ctrl+mouse).
 * On Linux Chromium, pinch always reports wheelDeltaY=±120 (including dY=0
 * keepalive events). Ctrl+touchpad scroll reports wheelDeltaY ≈ |deltaY|.
 */
export function isPinchWheelEvent(event: WheelEvent): boolean {
  if (!(event.ctrlKey || event.metaKey)) return false
  if (classifyMouseWheel(event)) return false

  const e = event as WheelDeltaEvent
  return (
    typeof e.wheelDeltaY === 'number' && Math.abs(e.wheelDeltaY) === ZOOM_PINCH_WHEEL_DELTA
  )
}

export interface SidePadding {
  left: number
  top: number
  right: number
  bottom: number
}

export interface ViewState {
  scale: number
  panX: number
  panY: number
  fitScale: number
  minScale: number
  initialPaddings: SidePadding
}

export const EMPTY_PADDING: SidePadding = { left: 0, top: 0, right: 0, bottom: 0 }

export function clampValue(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2
  return Math.min(max, Math.max(min, value))
}

/** Chromium percent-scale pinch factor, or null if within deadzone. */
export function pinchZoomFactor(deltaY: number): number | null {
  if (Math.abs(deltaY) < ZOOM_PINCH_DEADZONE) return null
  return clampValue(
    Math.exp(-deltaY / ZOOM_PINCH_DIVISOR),
    ZOOM_PINCH_FACTOR_MIN,
    ZOOM_PINCH_FACTOR_MAX
  )
}

/** Proportional Ctrl+scroll / Ctrl+mouse zoom (no clamp saturation). */
export function ctrlScrollZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * ZOOM_CTRL_SCROLL_INTENSITY)
}

export function computeMaxScale(minScale: number): number {
  return Math.max(minScale * MAX_SCALE_MULTIPLIER, 1)
}

export function computeFit(
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number
): ViewState {
  const innerWidth = Math.max(0, viewportWidth - FIT_PADDING * 2)
  const innerHeight = Math.max(0, viewportHeight - FIT_PADDING * 2)
  const fitScale = Math.min(innerWidth / imageWidth, innerHeight / imageHeight)
  const scaledWidth = imageWidth * fitScale
  const scaledHeight = imageHeight * fitScale
  const panX = FIT_PADDING + (innerWidth - scaledWidth) / 2
  const panY = FIT_PADDING + (innerHeight - scaledHeight) / 2

  return {
    fitScale,
    scale: fitScale,
    minScale: fitScale,
    panX,
    panY,
    initialPaddings: {
      left: panX,
      top: panY,
      right: viewportWidth - panX - scaledWidth,
      bottom: viewportHeight - panY - scaledHeight
    }
  }
}

export function clampPan(
  panX: number,
  panY: number,
  scale: number,
  fitScale: number,
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number,
  initialPaddings: SidePadding
): { panX: number; panY: number } {
  const ratio = scale / fitScale
  const minLeft = initialPaddings.left * ratio
  const minTop = initialPaddings.top * ratio
  const minRight = initialPaddings.right * ratio
  const minBottom = initialPaddings.bottom * ratio
  const scaledWidth = imageWidth * scale
  const scaledHeight = imageHeight * scale

  return {
    panX: clampValue(panX, viewportWidth - scaledWidth - minRight, minLeft),
    panY: clampValue(panY, viewportHeight - scaledHeight - minBottom, minTop)
  }
}

export function computeZoomPan(
  pointerX: number,
  pointerY: number,
  panX: number,
  panY: number,
  currentScale: number,
  nextScale: number
): { scale: number; panX: number; panY: number } {
  const contentX = (pointerX - panX) / currentScale
  const contentY = (pointerY - panY) / currentScale

  return {
    scale: nextScale,
    panX: pointerX - contentX * nextScale,
    panY: pointerY - contentY * nextScale
  }
}

export interface ImageViewportOptions {
  viewportRef: () => HTMLDivElement | undefined
  imageSize: Accessor<{ width: number; height: number } | null>
  isAnnotationMode: Accessor<boolean>
}

const FOCUS_BOUNDS_PADDING = 48

export interface ImageViewportController {
  scale: Accessor<number>
  panX: Accessor<number>
  panY: Accessor<number>
  fitScale: Accessor<number>
  minScale: Accessor<number>
  initialPaddings: Accessor<SidePadding>
  panning: Accessor<boolean>
  viewTransform: Accessor<ViewTransform>
  applyView: (view: ViewState) => void
  setClampedPan: (nextPanX: number, nextPanY: number) => void
  fitToViewport: (size: { width: number; height: number }) => void
  focusBounds: (bounds: ImageBounds, padding?: number) => void
  zoomAt: (pointerX: number, pointerY: number, deltaScale: number) => void
  handleWheel: (event: WheelEvent) => void
  handleMouseDown: (event: MouseEvent) => void
  stopPan: () => void
}

export function createImageViewport(options: ImageViewportOptions): ImageViewportController {
  const [scale, setScale] = createSignal(1)
  const [panX, setPanX] = createSignal(0)
  const [panY, setPanY] = createSignal(0)
  const [fitScale, setFitScale] = createSignal(1)
  const [minScale, setMinScale] = createSignal(0.1)
  const [initialPaddings, setInitialPaddings] = createSignal<SidePadding>(EMPTY_PADDING)
  const [panning, setPanning] = createSignal(false)

  let panStartX = 0
  let panStartY = 0
  let panOriginX = 0
  let panOriginY = 0
  let lastWheelTime = -Infinity
  let burstIsMouseWheel = false

  const maxScale = (): number => computeMaxScale(minScale())

  const viewTransform = (): ViewTransform => ({
    panX: panX(),
    panY: panY(),
    scale: scale(),
    fitScale: fitScale(),
    maxScale: maxScale()
  })

  const applyView = (view: ViewState): void => {
    setScale(view.scale)
    setFitScale(view.fitScale)
    setMinScale(view.minScale)
    setInitialPaddings(view.initialPaddings)
    setPanX(view.panX)
    setPanY(view.panY)
  }

  const clampCurrentPan = (
    nextPanX: number,
    nextPanY: number,
    nextScale = scale()
  ): { panX: number; panY: number } => {
    const viewport = options.viewportRef()
    const size = options.imageSize()
    if (!viewport || !size) return { panX: nextPanX, panY: nextPanY }

    return clampPan(
      nextPanX,
      nextPanY,
      nextScale,
      fitScale(),
      viewport.clientWidth,
      viewport.clientHeight,
      size.width,
      size.height,
      initialPaddings()
    )
  }

  const setClampedPan = (nextPanX: number, nextPanY: number, nextScale = scale()): void => {
    let pan = { panX: nextPanX, panY: nextPanY }
    if (options.isAnnotationMode()) {
      pan = snapPanToImagePixelGrid(pan.panX, pan.panY, nextScale)
    }
    const clamped = clampCurrentPan(pan.panX, pan.panY, nextScale)
    setPanX(clamped.panX)
    setPanY(clamped.panY)
  }

  const fitToViewport = (size: { width: number; height: number }): void => {
    const viewport = options.viewportRef()
    if (!viewport) return

    applyView(computeFit(viewport.clientWidth, viewport.clientHeight, size.width, size.height))
  }

  const focusBounds = (bounds: ImageBounds, padding = FOCUS_BOUNDS_PADDING): void => {
    const viewport = options.viewportRef()
    const size = options.imageSize()
    if (!viewport || !size) return
    if (bounds.width <= 0 || bounds.height <= 0) return

    const viewportWidth = viewport.clientWidth
    const viewportHeight = viewport.clientHeight
    const innerWidth = Math.max(1, viewportWidth - padding * 2)
    const innerHeight = Math.max(1, viewportHeight - padding * 2)
    const targetScale = Math.min(innerWidth / bounds.width, innerHeight / bounds.height, maxScale())
    const nextScale = Math.max(minScale(), targetScale)
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2
    const nextPanX = viewportWidth / 2 - centerX * nextScale
    const nextPanY = viewportHeight / 2 - centerY * nextScale

    setScale(nextScale)
    setClampedPan(nextPanX, nextPanY, nextScale)
  }

  const zoomAt = (clientX: number, clientY: number, nextScale: number): void => {
    const viewport = options.viewportRef()
    if (!viewport) return

    const rect = viewport.getBoundingClientRect()
    const pointerX = clientX - rect.left
    const pointerY = clientY - rect.top
    const currentScale = scale()
    const clampedScale = Math.min(maxScale(), Math.max(minScale(), nextScale))
    // Skip no-op updates (min/max clamp or factor≈1) — avoids pan snap jitter.
    if (Math.abs(clampedScale - currentScale) < 1e-9) return

    const zoomed = computeZoomPan(pointerX, pointerY, panX(), panY(), currentScale, clampedScale)

    setScale(zoomed.scale)
    setClampedPan(zoomed.panX, zoomed.panY, clampedScale)
  }

  const handleWheel = (event: WheelEvent): void => {
    event.preventDefault()

    const now = performance.now()
    if (now - lastWheelTime > WHEEL_BURST_GAP_MS) {
      burstIsMouseWheel = classifyMouseWheel(event)
    }
    lastWheelTime = now

    // Zoom: mouse wheel, Ctrl/Meta+scroll, or touchpad pinch (ctrlKey).
    // Pan: touchpad two-finger scroll (vertical + horizontal).
    if (event.ctrlKey || event.metaKey) {
      if (isPinchWheelEvent(event)) {
        const factor = pinchZoomFactor(event.deltaY)
        if (factor == null) return
        zoomAt(event.clientX, event.clientY, scale() * factor)
        return
      }
      zoomAt(event.clientX, event.clientY, scale() * ctrlScrollZoomFactor(event.deltaY))
      return
    }
    if (burstIsMouseWheel) {
      zoomAt(
        event.clientX,
        event.clientY,
        scale() * Math.exp(-event.deltaY * ZOOM_WHEEL_INTENSITY)
      )
      return
    }

    setClampedPan(panX() - event.deltaX, panY() - event.deltaY)
  }

  const stopPan = (): void => {
    setPanning(false)
    window.removeEventListener('mousemove', handlePanMove)
    window.removeEventListener('mouseup', handlePanEnd)
  }

  const handlePanMove = (event: MouseEvent): void => {
    const dx = event.clientX - panStartX
    const dy = event.clientY - panStartY
    const currentScale = scale()

    if (options.isAnnotationMode()) {
      const pan = panFromScreenDrag(panOriginX, panOriginY, dx, dy, currentScale)
      setClampedPan(pan.panX, pan.panY, currentScale)
      return
    }

    setClampedPan(panOriginX + dx, panOriginY + dy, currentScale)
  }

  const handlePanEnd = (event: MouseEvent): void => {
    if (event.button !== 1) return
    stopPan()
  }

  const handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 1) return
    event.preventDefault()
    setPanning(true)
    panStartX = event.clientX
    panStartY = event.clientY
    panOriginX = panX()
    panOriginY = panY()
    window.addEventListener('mousemove', handlePanMove)
    window.addEventListener('mouseup', handlePanEnd)
  }

  return {
    scale,
    panX,
    panY,
    fitScale,
    minScale,
    initialPaddings,
    panning,
    viewTransform,
    applyView,
    setClampedPan,
    fitToViewport,
    focusBounds,
    zoomAt,
    handleWheel,
    handleMouseDown,
    stopPan
  }
}
