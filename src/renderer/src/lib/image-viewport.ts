import { createSignal, type Accessor } from 'solid-js'
import type { ImageBounds, ViewTransform } from './annotation-coords'
import { panFromScreenDrag, snapPanToImagePixelGrid } from './annotation-coords'

export const MAX_SCALE_MULTIPLIER = 16
/**
 * Mouse-wheel notches: |deltaY| is typically 100 or 120 (or multiples).
 * Intensity chosen so one notch ≈ ±20% (exp(120 * 0.0015) ≈ 1.20).
 */
export const ZOOM_WHEEL_INTENSITY = 0.0015
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
 * Ctrl+touchpad scroll emits large pixel-like deltas continuously.
 * dy=100 → ~6%, dy=200 → ~13%.
 */
export const ZOOM_CTRL_SCROLL_INTENSITY = 0.0006
export const FIT_PADDING = 16

export const WHEEL_TYPES = {
  TRACK_ZOOM: 'TRACK_ZOOM',
  TRACK_SCROLL: 'TRACK_SCROLL',
  TRACK_CTRL_SCROLL: 'TRACK_CTRL_SCROLL',
  MOUSE_ZOOM: 'MOUSE_ZOOM',
  MOUSE_SCROLL: 'MOUSE_SCROLL'
} as const

export type WheelType = (typeof WHEEL_TYPES)[keyof typeof WHEEL_TYPES]

type WheelDeltaEvent = WheelEvent & {
  wheelDelta?: number
  wheelDeltaX?: number
  wheelDeltaY?: number
}

/**
 * Pinch sets ctrlKey without a real Ctrl press. Track physical Ctrl so we can
 * tell TRACK_ZOOM (pinch) from TRACK_CTRL_SCROLL (Ctrl+trackpad swipe).
 */
let isCtrlKeyPressed = false
let ctrlKeyTrackingInstalled = false

const onCtrlPress = (event: KeyboardEvent): void => {
  if (event.key !== 'Control') return
  isCtrlKeyPressed = true
  document.removeEventListener('keydown', onCtrlPress)
  document.addEventListener('keyup', onCtrlRelease)
}

const onCtrlRelease = (event: KeyboardEvent): void => {
  if (event.key !== 'Control') return
  isCtrlKeyPressed = false
  document.addEventListener('keydown', onCtrlPress)
  document.removeEventListener('keyup', onCtrlRelease)
}

const onWindowBlur = (): void => {
  if (!isCtrlKeyPressed) return
  isCtrlKeyPressed = false
  document.removeEventListener('keyup', onCtrlRelease)
  document.addEventListener('keydown', onCtrlPress)
}

function ensureCtrlKeyTracking(): void {
  if (ctrlKeyTrackingInstalled || typeof document === 'undefined') return
  ctrlKeyTrackingInstalled = true
  document.addEventListener('keydown', onCtrlPress)
  window.addEventListener('blur', onWindowBlur)
}

/** Mouse wheel vs trackpad — same heuristics as gesture-check.html. */
export function isWheelMouse(event: WheelEvent): boolean {
  if (!(event instanceof WheelEvent)) {
    throw new Error('Event must be a WheelEvent')
  }

  // Line/page units are discrete mouse-wheel notches.
  if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
    return true
  }

  // Simultaneous X+Y motion is almost always a trackpad.
  if (event.deltaX !== 0 && event.deltaY !== 0) {
    return false
  }

  const e = event as WheelDeltaEvent

  // Chromium trackpad signature: wheelDeltaY === -3 * deltaY.
  // Fast trackpad flicks can exceed old magnitude thresholds, so prefer this.
  if (
    typeof e.wheelDeltaY === 'number' &&
    e.wheelDeltaY !== 0 &&
    e.wheelDeltaY === -3 * event.deltaY
  ) {
    return false
  }

  // Fractional pixel deltas → trackpad.
  if (!Number.isInteger(event.deltaX) || !Number.isInteger(event.deltaY)) {
    return false
  }

  // Classic mouse notch: wheelDelta is a multiple of 120 on one axis.
  const wheelDelta =
    typeof e.wheelDelta === 'number'
      ? e.wheelDelta
      : typeof e.wheelDeltaY === 'number'
        ? e.wheelDeltaY
        : 0
  if (
    wheelDelta !== 0 &&
    Math.abs(wheelDelta) % 120 === 0 &&
    (event.deltaX === 0) !== (event.deltaY === 0)
  ) {
    return true
  }

  // Last resort: large single-axis integer jump.
  const abs = Math.abs(event.deltaX) + Math.abs(event.deltaY)
  return (event.deltaX === 0) !== (event.deltaY === 0) && abs >= 100
}

/**
 * Pinch sets ctrlKey without a real Ctrl press; Ctrl+mouse-wheel is always zoom.
 * Cmd/Meta+scroll is intentional zoom (metaKey is never auto-set by pinch).
 */
export function isWheelZoom(event: WheelEvent): boolean {
  if (!(event instanceof WheelEvent)) {
    throw new Error('Event must be a WheelEvent')
  }
  ensureCtrlKeyTracking()

  if (event.metaKey) return true
  if (!event.ctrlKey) return false
  return isWheelMouse(event) || !isCtrlKeyPressed
}

export function getWheelType(event: WheelEvent): WheelType {
  if (!(event instanceof WheelEvent)) {
    throw new Error('Event must be a WheelEvent')
  }
  ensureCtrlKeyTracking()

  if (isWheelZoom(event)) {
    return isWheelMouse(event) ? WHEEL_TYPES.MOUSE_ZOOM : WHEEL_TYPES.TRACK_ZOOM
  }

  if (isWheelMouse(event)) {
    return WHEEL_TYPES.MOUSE_SCROLL
  }
  if (event.ctrlKey && isCtrlKeyPressed) {
    return WHEEL_TYPES.TRACK_CTRL_SCROLL
  }
  return WHEEL_TYPES.TRACK_SCROLL
}

export function wheelZoomDelta(event: WheelEvent): number {
  return Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
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
export function pinchZoomFactor(delta: number): number | null {
  if (Math.abs(delta) < ZOOM_PINCH_DEADZONE) return null
  return clampValue(
    Math.exp(-delta / ZOOM_PINCH_DIVISOR),
    ZOOM_PINCH_FACTOR_MIN,
    ZOOM_PINCH_FACTOR_MAX
  )
}

/** Discrete mouse-wheel / Ctrl+mouse zoom factor. */
export function mouseZoomFactor(delta: number): number {
  return Math.exp(-delta * ZOOM_WHEEL_INTENSITY)
}

/** Proportional Ctrl+trackpad scroll zoom (no per-event clamp saturation). */
export function ctrlScrollZoomFactor(delta: number): number {
  return Math.exp(-delta * ZOOM_CTRL_SCROLL_INTENSITY)
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

  ensureCtrlKeyTracking()

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

    const type = getWheelType(event)
    const delta = wheelZoomDelta(event)

    if (type === WHEEL_TYPES.TRACK_ZOOM) {
      const factor = pinchZoomFactor(delta)
      if (factor == null) return
      zoomAt(event.clientX, event.clientY, scale() * factor)
      return
    }

    if (type === WHEEL_TYPES.MOUSE_ZOOM || type === WHEEL_TYPES.MOUSE_SCROLL) {
      zoomAt(event.clientX, event.clientY, scale() * mouseZoomFactor(delta))
      return
    }

    if (type === WHEEL_TYPES.TRACK_CTRL_SCROLL) {
      zoomAt(event.clientX, event.clientY, scale() * ctrlScrollZoomFactor(delta))
      return
    }

    // TRACK_SCROLL — two-finger pan
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
