import { createSignal, type Accessor } from 'solid-js'
import type { ImageBounds, ViewTransform } from './annotation-coords'
import { panFromScreenDrag, snapPanToImagePixelGrid } from './annotation-coords'

export const MAX_SCALE_MULTIPLIER = 16
export const ZOOM_INTENSITY = 0.0015
export const FIT_PADDING = 16
/** Wheel events closer than this inherit the burst's mouse/trackpad classification. */
export const WHEEL_BURST_GAP_MS = 80

type WheelDeltaEvent = WheelEvent & { wheelDeltaX?: number; wheelDeltaY?: number }

/**
 * Best-effort mouse-wheel vs trackpad classification.
 * There is no reliable browser API (WHATWG/W3C still open); Chromium exposes
 * non-standard wheelDelta* as multiples of ±120 per physical notch.
 */
export function classifyMouseWheel(event: WheelEvent): boolean {
  if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return true

  const e = event as WheelDeltaEvent
  if (typeof e.wheelDeltaY === 'number' && e.wheelDeltaY !== 0) {
    return e.wheelDeltaY % 120 === 0
  }
  if (typeof e.wheelDeltaX === 'number' && e.wheelDeltaX !== 0) {
    return e.wheelDeltaX % 120 === 0
  }

  // Fallback without wheelDelta*: diagonal motion is almost always a trackpad.
  if (event.deltaX !== 0 && event.deltaY !== 0) return false
  return Number.isInteger(event.deltaX) && Number.isInteger(event.deltaY)
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
    if (event.ctrlKey || event.metaKey || burstIsMouseWheel) {
      const nextScale = scale() * Math.exp(-event.deltaY * ZOOM_INTENSITY)
      zoomAt(event.clientX, event.clientY, nextScale)
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
