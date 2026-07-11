import type { Component } from 'solid-js'
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import type { Label, RectangleShape } from '../../../shared/annotations'
import { SELECTED_SHAPE_OPACITY, SHAPE_OPACITY } from '../../../shared/annotations'
import type { SegmentationMode } from '../../../shared/segmentation'
import { hexToRgba, hexToRgbNormalized } from '../../../shared/label-color'
import type { ViewTransform } from '../lib/annotation-coords'
import {
  clampToImage,
  eraseCapsuleFromMaskData,
  erasePixelBrushStrokeFromMaskData,
  hitTestMaskBounds,
  hitTestPolygon,
  hitTestRectangle,
  snapPointToImagePixel,
  tightenMaskBitmap,
  viewportToImage
} from '../lib/annotation-coords'
import type { WorkingShape } from '../lib/annotation-store'
import { AnnotationStore } from '../lib/annotation-store'
import {
  BrushEngine,
  type CapsuleSegment,
  type Point2D,
  type SavedMaskLayer,
  type StampMode,
  type TopologyHint
} from '../lib/brush/brush-engine'
import {
  BRUSH_PREVIEW_FILLED_OPACITY,
  getBrushPreviewSettings,
  getEffectiveBrushDiameter,
  usesSvgBrushPreview
} from '../lib/brush/constants'
import {
  forEachBrushStrokeCenter,
  forEachPixelBrushPixel,
  usesPixelBrushShape
} from '../lib/brush/brush-shapes'
import { renderSemanticOverlay, stampClassIdStroke } from '../lib/semantic-class-map'
import type { SemanticMapStore } from '../lib/semantic-map-store'
import type { AnnotationTool } from './AnnotationToolbar'

export interface TopologyAlert {
  message: string
  onDismiss: () => void
}

const MIN_RECT_SIZE = 3

interface TopologyIssueMask {
  id: string
  kind: 'island' | 'hole'
  x: number
  y: number
  width: number
  height: number
  data: Uint8Array
}

interface SegmentationWorkerResult {
  id: number
  issues: TopologyIssueMask[]
  polygon: { x: number; y: number }[] | null
}

function findShapeAtPoint(
  shapes: WorkingShape[],
  x: number,
  y: number
): WorkingShape | null {
  for (let index = shapes.length - 1; index >= 0; index--) {
    const shape = shapes[index]
    if (shape.type === 'rectangle' && hitTestRectangle(x, y, shape)) return shape
    if (shape.type === 'mask' && hitTestMaskBounds(x, y, shape.bounds)) return shape
    if (shape.type === 'polygon' && hitTestPolygon(x, y, shape.points)) return shape
  }
  return null
}

function polygonPointsToSvg(points: { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

const AnnotationOverlay: Component<{
  viewportRef: () => HTMLDivElement | undefined
  transform: () => ViewTransform
  imageSize: () => { width: number; height: number } | null
  activeTool: () => AnnotationTool
  activeLabelId: () => string | null
  brushSize: () => number
  shrinkBrushAtMaxZoom: () => boolean
  labels: () => Label[]
  store: AnnotationStore
  semanticStore: SemanticMapStore | null
  segmentationMode: () => SegmentationMode
  onTopologyAlertChange?: (alert: TopologyAlert | null) => void
}> = (props) => {
  let glCanvasRef: HTMLCanvasElement | undefined
  let semanticCanvasRef: HTMLCanvasElement | undefined
  let overlayRef: HTMLDivElement | undefined

  const [draftRect, setDraftRect] = createSignal<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const [hoverPoint, setHoverPoint] = createSignal<Point2D | null>(null)
  const [topologyIssues, setTopologyIssues] = createSignal<TopologyIssueMask[]>([])

  let lastPointerClient: { x: number; y: number } | null = null

  let dragMode: 'none' | 'draw-rect' | 'move-rect' = 'none'
  let dragStart = { x: 0, y: 0 }
  let moveShapeId: string | null = null
  let moveOffset = { x: 0, y: 0 }

  let brushEngine: BrushEngine | null = null
  let isDrawing = false
  let activePointerId: number | null = null
  let strokeSegments: CapsuleSegment[] = []
  let lastPoint: Point2D | null = null
  let lockedBrushDiameterImagePx = 1
  let sessionUndoPushed = false
  let semanticUndoPushed = false
  let brushStrokeMode: StampMode = 'paint'
  let savedMasksErased = false
  let topologyCommitAttempt = 0
  let renderFrame = 0
  let segmentationWorker: Worker | null = null
  let nextSegmentationRequestId = 0
  let nextTopologyIssueMaskId = 0
  let segmentationGeneration = 0
  let isCommitProcessing = false
  const pendingSegmentationRequests = new Map<
    number,
    { resolve: (result: SegmentationWorkerResult) => void; reject: (error: Error) => void }
  >()

  const labelMap = createMemo(() => new Map(props.labels().map((label) => [label.id, label])))
  const classColorMap = createMemo(
    () => new Map(props.labels().map((label) => [label.classId, label.color]))
  )
  const rectangles = createMemo(() =>
    props.store.shapes[0]().filter((shape): shape is RectangleShape => shape.type === 'rectangle')
  )
  const polygons = createMemo(() =>
    props.store.shapes[0]().filter((shape) => shape.type === 'polygon')
  )
  const topologyHints = createMemo((): TopologyHint[] =>
    topologyIssues().map((issue) => ({
      ...issue,
      colorRgb: [0.94, 0.27, 0.27] as [number, number, number]
    }))
  )

  const getImagePointAt = (clientX: number, clientY: number): Point2D | null => {
    const viewport = props.viewportRef()
    const size = props.imageSize()
    if (!viewport || !size) return null
    const point = viewportToImage(
      clientX,
      clientY,
      viewport.getBoundingClientRect(),
      props.transform()
    )
    return snapPointToImagePixel(
      clampToImage(point.x, point.y, size.width, size.height),
      size.width,
      size.height
    )
  }

  const getImagePoint = (event: MouseEvent | PointerEvent): Point2D | null =>
    getImagePointAt(event.clientX, event.clientY)

  const syncHoverFromLastPointer = (): void => {
    if (!lastPointerClient || props.activeTool() !== 'mask') return
    setHoverPoint(getImagePointAt(lastPointerClient.x, lastPointerClient.y))
  }

  const effectiveBrushDiameter = (): number =>
    getEffectiveBrushDiameter(
      props.brushSize(),
      props.transform().scale,
      props.transform().maxScale,
      props.shrinkBrushAtMaxZoom()
    )

  const brushRadiusImagePx = (): number => effectiveBrushDiameter() / 2

  const brushSvgPreview = createMemo(() => {
    if (props.activeTool() !== 'mask') return null
    const hover = hoverPoint()
    if (!hover) return null

    const diameter = effectiveBrushDiameter()
    if (!usesPixelBrushShape(diameter)) return null

    const pixels: Array<{ x: number; y: number }> = []
    forEachPixelBrushPixel(hover.x, hover.y, diameter, (x, y) => {
      pixels.push({ x, y })
    })

    return {
      pixels,
      opacity: BRUSH_PREVIEW_FILLED_OPACITY
    }
  })

  const activeLabelColor = createMemo(() => {
    const labelId = props.activeLabelId()
    if (!labelId) return '#ffffff'
    return labelMap().get(labelId)?.color ?? '#ffffff'
  })

  const activeClassId = createMemo(() => {
    const labelId = props.activeLabelId()
    if (!labelId) return 0
    return labelMap().get(labelId)?.classId ?? 0
  })

  const savedMaskLayers = createMemo((): SavedMaskLayer[] => {
    const masks = props.store.shapes[0]().filter((shape) => shape.type === 'mask')
    masks.sort((left, right) => left.zOrder - right.zOrder)

    return masks.map((shape) => {
      const label = labelMap().get(shape.labelId)
      return {
        id: shape.id,
        version: shape.updatedAt,
        bounds: shape.bounds,
        data: shape.data,
        colorRgb: hexToRgbNormalized(label?.color ?? '#ffffff')
      }
    })
  })

  const ensureBrushEngine = (): BrushEngine | null => {
    const canvas = glCanvasRef
    const size = props.imageSize()
    if (!canvas || !size) return null

    const needsResize = canvas.width !== size.width || canvas.height !== size.height
    if (needsResize) {
      brushEngine?.dispose()
      brushEngine = null
      canvas.width = size.width
      canvas.height = size.height
      isDrawing = false
      activePointerId = null
      strokeSegments = []
      lastPoint = null
      sessionUndoPushed = false
      semanticUndoPushed = false
    }

    if (!brushEngine) {
      try {
        brushEngine = new BrushEngine(canvas)
        brushEngine.resize(size.width, size.height)
      } catch (error) {
        console.error('Failed to initialize brush engine:', error)
        return null
      }
    }

    return brushEngine
  }

  const renderSemanticCanvas = (): void => {
    const canvas = semanticCanvasRef
    const size = props.imageSize()
    const store = props.semanticStore
    const map = store?.classMap[0]()
    if (!canvas || !size || !map) return

    if (canvas.width !== size.width || canvas.height !== size.height) {
      canvas.width = size.width
      canvas.height = size.height
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const imageData = renderSemanticOverlay(
      map,
      size.width,
      size.height,
      classColorMap(),
      SHAPE_OPACITY
    )
    ctx.putImageData(imageData, 0, 0)
  }

  const requestOverlayRender = (): void => {
    if (renderFrame) return
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0
      renderOverlay()
    })
  }

  const flushOverlayRender = (): void => {
    if (renderFrame) {
      cancelAnimationFrame(renderFrame)
      renderFrame = 0
    }
    renderOverlay()
  }

  const renderOverlay = (): void => {
    if (props.segmentationMode() === 'semantic') {
      renderSemanticCanvas()
      return
    }

    const engine = ensureBrushEngine()
    if (!engine) return

    const maskToolActive = props.activeTool() === 'mask'
    const hover = hoverPoint()
    const previewRadius = brushRadiusImagePx()
    const correctingTopologyIssue =
      isDrawing &&
      topologyIssues().some((issue) =>
        brushStrokeMode === 'paint' ? issue.kind === 'hole' : issue.kind === 'island'
      )
    const labelColor = hexToRgbNormalized(activeLabelColor())
    const activeStrokeColor = correctingTopologyIssue
      ? ([0.13, 0.65, 0.35] as [number, number, number])
      : labelColor
    const activeOutsideStrokeColor =
      brushStrokeMode === 'erase' ? ([1, 1, 1] as [number, number, number]) : labelColor
    const preview = getBrushPreviewSettings(effectiveBrushDiameter())
    const useGlPreview =
      maskToolActive && Boolean(hover) && !usesSvgBrushPreview(effectiveBrushDiameter())

    engine.renderScene(
      savedMaskLayers(),
      labelColor,
      useGlPreview,
      useGlPreview && hover
        ? {
            center: hover,
            radiusPx: previewRadius,
            strokeWidthPx: preview.strokeWidthPx,
            innerStrokeWidthPx: preview.innerStrokeWidthPx,
            outerOpacity: preview.outerOpacity,
            innerOpacity: preview.innerOpacity,
            filled: preview.mode === 'filled'
          }
        : undefined,
      topologyHints(),
      activeStrokeColor,
      activeOutsideStrokeColor
    )
  }

  const resetBrushSession = (): void => {
    segmentationGeneration++
    isDrawing = false
    activePointerId = null
    strokeSegments = []
    lastPoint = null
    sessionUndoPushed = false
    semanticUndoPushed = false
    brushStrokeMode = 'paint'
    savedMasksErased = false
    topologyCommitAttempt = 0
    clearTopologyAlert()
    brushEngine?.clearBrushOverlays()
    requestOverlayRender()
  }

  const clearTopologyAlert = (): void => {
    setTopologyIssues([])
    props.onTopologyAlertChange?.(null)
  }

  const releaseActivePointerCapture = (): void => {
    if (overlayRef && activePointerId !== null && overlayRef.hasPointerCapture(activePointerId)) {
      overlayRef.releasePointerCapture(activePointerId)
    }
    activePointerId = null
  }

  const finalizeStrokeAfterCommit = (): void => {
    strokeSegments = []
    lastPoint = null
    isDrawing = false
    releaseActivePointerCapture()
    brushEngine?.clearBrushOverlays()
  }

  const showTopologyAlert = (message: string, issues: TopologyIssueMask[] = []): void => {
    setTopologyIssues(issues)
    props.onTopologyAlertChange?.({
      message,
      onDismiss: () => {
        topologyCommitAttempt = 0
        clearTopologyAlert()
      }
    })
  }

  const getSegmentationWorker = (): Worker => {
    if (segmentationWorker) return segmentationWorker

    segmentationWorker = new Worker(new URL('../lib/polygon/segmentation-worker.ts', import.meta.url), {
      type: 'module'
    })
    segmentationWorker.onmessage = (event: MessageEvent<SegmentationWorkerResult>) => {
      const pending = pendingSegmentationRequests.get(event.data.id)
      if (!pending) return
      pendingSegmentationRequests.delete(event.data.id)
      pending.resolve(event.data)
    }
    segmentationWorker.onerror = (event) => {
      const error = new Error(event.message || 'Mask conversion worker failed.')
      for (const pending of pendingSegmentationRequests.values()) {
        pending.reject(error)
      }
      pendingSegmentationRequests.clear()
      segmentationWorker?.terminate()
      segmentationWorker = null
    }

    return segmentationWorker
  }

  const convertMaskInWorker = (
    data: Uint8Array,
    width: number,
    height: number,
    repairTopology: boolean
  ): Promise<SegmentationWorkerResult> => {
    const worker = getSegmentationWorker()
    const id = ++nextSegmentationRequestId
    const buffer = data.buffer as ArrayBuffer

    return new Promise((resolve, reject) => {
      pendingSegmentationRequests.set(id, { resolve, reject })
      worker.postMessage({ id, data: buffer, width, height, repairTopology }, [buffer])
    })
  }

  const applyManualIssueGuesses = (segments: CapsuleSegment[], mode: StampMode): void => {
    if (segments.length === 0) return

    const kindToFix = mode === 'paint' ? 'hole' : 'island'
    const nextIssues: TopologyIssueMask[] = []
    let didChange = false

    for (const issue of topologyIssues()) {
      if (issue.kind !== kindToFix) {
        nextIssues.push(issue)
        continue
      }

      const remaining = new Uint8Array(issue.data)
      let changed = false

      const markPixel = (x: number, y: number): void => {
        const localX = x - issue.x
        const localY = y - issue.y
        if (localX < 0 || localY < 0 || localX >= issue.width || localY >= issue.height) return

        const index = localY * issue.width + localX
        if (!remaining[index]) return
        remaining[index] = 0
        changed = true
      }

      for (const segment of segments) {
        if (usesPixelBrushShape(lockedBrushDiameterImagePx)) {
          forEachBrushStrokeCenter(
            segment.from.x,
            segment.from.y,
            segment.to.x,
            segment.to.y,
            (centerX, centerY) => {
              forEachPixelBrushPixel(centerX, centerY, lockedBrushDiameterImagePx, markPixel)
            }
          )
          continue
        }

        const radius = lockedBrushDiameterImagePx / 2
        const minX = Math.max(issue.x, Math.floor(Math.min(segment.from.x, segment.to.x) - radius))
        const minY = Math.max(issue.y, Math.floor(Math.min(segment.from.y, segment.to.y) - radius))
        const maxX = Math.min(
          issue.x + issue.width - 1,
          Math.ceil(Math.max(segment.from.x, segment.to.x) + radius)
        )
        const maxY = Math.min(
          issue.y + issue.height - 1,
          Math.ceil(Math.max(segment.from.y, segment.to.y) + radius)
        )
        const dx = segment.to.x - segment.from.x
        const dy = segment.to.y - segment.from.y
        const lengthSquared = dx * dx + dy * dy

        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const projection =
              lengthSquared === 0
                ? 0
                : Math.min(
                    1,
                    Math.max(0, ((x - segment.from.x) * dx + (y - segment.from.y) * dy) / lengthSquared)
                  )
            const closestX = segment.from.x + projection * dx
            const closestY = segment.from.y + projection * dy
            if (Math.hypot(x - closestX, y - closestY) <= radius) {
              markPixel(x, y)
            }
          }
        }
      }

      if (!changed) {
        nextIssues.push(issue)
        continue
      }
      didChange = true

      if (remaining.some((value) => value > 0)) {
        nextIssues.push({
          ...issue,
          id: `${issue.id}:remaining:${++nextTopologyIssueMaskId}`,
          data: remaining
        })
      }
    }

    if (didChange) {
      setTopologyIssues(nextIssues)
    }
  }

  const eraseFromSavedMasks = (from: Point2D, to: Point2D): void => {
    const size = props.imageSize()
    if (!size) return

    let changed = false
    for (const shape of props.store.shapes[0]()) {
      if (shape.type !== 'mask') continue
      const erased = usesPixelBrushShape(lockedBrushDiameterImagePx)
        ? erasePixelBrushStrokeFromMaskData(
            shape.data,
            shape.bounds,
            from,
            to,
            lockedBrushDiameterImagePx
          )
        : eraseCapsuleFromMaskData(
            shape.data,
            shape.bounds,
            from,
            to,
            lockedBrushDiameterImagePx / 2
          )
      if (erased) changed = true
    }

    if (changed) {
      savedMasksErased = true
      requestOverlayRender()
    }
  }

  const finalizeErasedMasks = (): void => {
    if (!savedMasksErased) return

    const size = props.imageSize()
    if (!size) return

    const now = new Date().toISOString()
    const nextShapes: WorkingShape[] = []

    for (const shape of props.store.shapes[0]()) {
      if (shape.type !== 'mask') {
        nextShapes.push(shape)
        continue
      }

      const tightened = tightenMaskBitmap(shape, size.width, size.height)
      if (!tightened) continue
      nextShapes.push({ ...tightened, updatedAt: now })
    }

    props.store.setShapes(nextShapes)
    savedMasksErased = false
  }

  const addStrokeSegment = (from: Point2D, to: Point2D): void => {
    const segment = { from, to }
    strokeSegments.push(segment)

    if (props.segmentationMode() === 'semantic') {
      const store = props.semanticStore
      const size = props.imageSize()
      const map = store?.getMutableClassMap()
      if (!store || !size || !map) return
      const classId = brushStrokeMode === 'erase' ? 0 : activeClassId()
      const next = new Uint16Array(map)
      stampClassIdStroke(
        next,
        size.width,
        size.height,
        from,
        to,
        lockedBrushDiameterImagePx,
        classId
      )
      store.setClassMap(next)
      requestOverlayRender()
      return
    }

    if (usesPixelBrushShape(lockedBrushDiameterImagePx)) {
      if (brushStrokeMode === 'erase') {
        brushEngine?.stampPixelBrushStroke(
          from,
          to,
          lockedBrushDiameterImagePx,
          'session',
          'erase'
        )
        brushEngine?.stampPixelBrushStroke(
          from,
          to,
          lockedBrushDiameterImagePx,
          'active',
          'paint'
        )
        eraseFromSavedMasks(from, to)
        return
      }

      brushEngine?.stampPixelBrushStroke(from, to, lockedBrushDiameterImagePx, 'active', 'paint')
      return
    }

    const radius = lockedBrushDiameterImagePx / 2
    if (brushStrokeMode === 'erase') {
      brushEngine?.stampCapsule(from, to, radius, 'session', 'erase')
      brushEngine?.stampCapsule(from, to, radius, 'active', 'paint')
      eraseFromSavedMasks(from, to)
      return
    }

    brushEngine?.stampCapsule(from, to, radius, 'active', 'paint')
  }

  const stampPendingStrokeToSession = (): void => {
    if (strokeSegments.length === 0 || brushStrokeMode !== 'paint') return

    if (usesPixelBrushShape(lockedBrushDiameterImagePx)) {
      brushEngine?.stampPixelBrushStrokes(
        strokeSegments,
        lockedBrushDiameterImagePx,
        'session',
        'paint'
      )
    } else {
      brushEngine?.stampCapsules(
        strokeSegments,
        lockedBrushDiameterImagePx / 2,
        'session',
        'paint'
      )
    }
    brushEngine?.clearActiveStroke()
  }

  const commitSessionPolygon = async (): Promise<void> => {
    if (isCommitProcessing) return

    const labelId = props.activeLabelId()
    const size = props.imageSize()
    if (!labelId || !size) return

    const engine = ensureBrushEngine()
    if (!engine) return

    stampPendingStrokeToSession()
    if (brushStrokeMode === 'erase') {
      engine.clearActiveStroke()
    }

    if (!engine.hasCommitContent()) {
      return
    }

    const raw = engine.readCommitMask()
    if (!raw) {
      return
    }

    isCommitProcessing = true
    const generation = segmentationGeneration
    try {
      const result = await convertMaskInWorker(
        raw,
        size.width,
        size.height,
        topologyCommitAttempt === 1
      )
      if (generation !== segmentationGeneration) return

      if (result.issues.length > 0) {
        if (topologyIssues().length === 0) {
          setTopologyIssues(result.issues)
        }
        topologyCommitAttempt = 1
        showTopologyAlert(
          'Disconnected regions or holes detected. Fix manually, or press Space again to auto-fill holes and remove islands.',
          result.issues
        )
        requestOverlayRender()
        return
      }

      if (!result.polygon) {
        showTopologyAlert('Could not convert mask to a polygon.')
        return
      }

      const shape = props.store.createPolygon(labelId, result.polygon)
      props.store.setShapes([...props.store.shapes[0](), shape])
      props.store.setSelectedShapeId(null)
      finalizeStrokeAfterCommit()
      sessionUndoPushed = false
      topologyCommitAttempt = 0
      clearTopologyAlert()
      flushOverlayRender()
    } catch (error) {
      console.error('Mask conversion failed:', error)
      showTopologyAlert('Could not convert mask to a polygon.')
    } finally {
      isCommitProcessing = false
    }
  }

  createEffect(() => {
    props.store.shapes[0]()
    props.store.selectedShapeId[0]()
    props.semanticStore?.classMap[0]()
    props.labels()
    props.imageSize()
    requestOverlayRender()
  })

  createEffect(() => {
    const size = props.imageSize()
    if (!size) return
    brushEngine?.dispose()
    brushEngine = null
    resetBrushSession()
  })

  createEffect(() => {
    props.activeTool()
    props.segmentationMode()
    lastPointerClient = null
    setHoverPoint(null)
    resetBrushSession()
    requestOverlayRender()
  })

  createEffect(() => {
    props.brushSize()
    props.shrinkBrushAtMaxZoom()
    const { scale, panX, panY } = props.transform()
    void scale
    void panX
    void panY
    syncHoverFromLastPointer()
    requestOverlayRender()
  })

  const stopInteraction = (): void => {
    dragMode = 'none'
    moveShapeId = null
    setDraftRect(null)
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }

  const stopBrushDrawing = (_event: PointerEvent): void => {
    if (!isDrawing) return

    isDrawing = false
    releaseActivePointerCapture()

    if (props.segmentationMode() === 'semantic') {
      semanticUndoPushed = false
      strokeSegments = []
      lastPoint = null
      brushStrokeMode = 'paint'
      requestOverlayRender()
      return
    }

    if (strokeSegments.length > 0) {
      topologyCommitAttempt = 0
      applyManualIssueGuesses(strokeSegments, brushStrokeMode)
    }
    if (strokeSegments.length > 0 && brushStrokeMode === 'paint') {
      if (usesPixelBrushShape(lockedBrushDiameterImagePx)) {
        brushEngine?.stampPixelBrushStrokes(
          strokeSegments,
          lockedBrushDiameterImagePx,
          'session',
          'paint'
        )
      } else {
        brushEngine?.stampCapsules(
          strokeSegments,
          lockedBrushDiameterImagePx / 2,
          'session',
          'paint'
        )
      }
    }
    if (brushStrokeMode === 'erase') {
      finalizeErasedMasks()
    }
    brushEngine?.clearActiveStroke()
    strokeSegments = []
    lastPoint = null
    brushStrokeMode = 'paint'
    requestOverlayRender()
  }

  const handleMouseMove = (event: MouseEvent): void => {
    const point = getImagePoint(event)
    const size = props.imageSize()
    if (!point || !size) return

    if (dragMode === 'draw-rect') {
      const width = Math.round(point.x - dragStart.x)
      const height = Math.round(point.y - dragStart.y)
      const x = width < 0 ? point.x : dragStart.x
      const y = height < 0 ? point.y : dragStart.y
      setDraftRect({
        x,
        y,
        width: Math.abs(width),
        height: Math.abs(height)
      })
      return
    }

    if (dragMode === 'move-rect' && moveShapeId) {
      const shapes = props.store.shapes[0]()
      const next = shapes.map((shape) => {
        if (shape.id !== moveShapeId || shape.type !== 'rectangle') return shape
        const nextX = Math.round(
          Math.min(Math.max(point.x - moveOffset.x, 0), size.width - shape.width)
        )
        const nextY = Math.round(
          Math.min(Math.max(point.y - moveOffset.y, 0), size.height - shape.height)
        )
        return { ...shape, x: nextX, y: nextY }
      })
      props.store.setShapes(next)
    }
  }

  const handleMouseUp = (): void => {
    if (dragMode === 'draw-rect') {
      const rect = draftRect()
      const labelId = props.activeLabelId()
      if (rect && labelId && rect.width >= MIN_RECT_SIZE && rect.height >= MIN_RECT_SIZE) {
        props.store.pushUndo()
        const shape = props.store.createRectangle(labelId, rect)
        props.store.setShapes([...props.store.shapes[0](), shape])
        props.store.setSelectedShapeId(shape.id)
      }
    }

    if (dragMode === 'move-rect') {
      props.store.markDirty()
    }

    stopInteraction()
  }

  const handleOverlayPointerDown = (event: PointerEvent): void => {
    if (props.activeTool() === 'mask') {
      if (event.button !== 0 && event.button !== 2) return
      if (props.segmentationMode() === 'instance' && isCommitProcessing) return

      event.preventDefault()
      brushStrokeMode = event.button === 2 ? 'erase' : 'paint'

      const point = getImagePoint(event)
      const labelId = props.activeLabelId()
      if (!point) return
      if (props.segmentationMode() === 'instance' && !ensureBrushEngine()) return
      if (brushStrokeMode === 'paint' && !labelId) return

      if (props.segmentationMode() === 'semantic') {
        if (!semanticUndoPushed) {
          props.semanticStore?.pushUndo()
          semanticUndoPushed = true
        }
      } else if (!sessionUndoPushed) {
        props.store.pushUndo()
        sessionUndoPushed = true
      }

      overlayRef?.setPointerCapture(event.pointerId)
      activePointerId = event.pointerId
      isDrawing = true
      savedMasksErased = false
      setHoverPoint(point)
      strokeSegments = []
      lockedBrushDiameterImagePx = effectiveBrushDiameter()
      brushEngine?.clearActiveStroke()
      addStrokeSegment(point, point)
      lastPoint = point
      requestOverlayRender()
      return
    }

    if (event.button !== 0) return

    event.preventDefault()
    const point = getImagePoint(event)
    if (!point) return

    const tool = props.activeTool()

    if (tool === 'cursor') {
      const hit = findShapeAtPoint(props.store.shapes[0](), point.x, point.y)
      props.store.setSelectedShapeId(hit?.id ?? null)
      if (hit?.type === 'rectangle') {
        props.store.pushUndo()
        dragMode = 'move-rect'
        moveShapeId = hit.id
        moveOffset = { x: point.x - hit.x, y: point.y - hit.y }
        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
      }
      return
    }

    if (tool === 'rectangle' && props.segmentationMode() === 'instance') {
      if (!props.activeLabelId()) return
      dragMode = 'draw-rect'
      dragStart = point
      setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 })
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
  }

  const handleOverlayPointerMove = (event: PointerEvent): void => {
    if (props.activeTool() !== 'mask') return

    lastPointerClient = { x: event.clientX, y: event.clientY }
    const point = getImagePoint(event)
    if (!point) {
      setHoverPoint(null)
      requestOverlayRender()
      return
    }

    setHoverPoint(point)

    if (isDrawing && lastPoint) {
      if (point.x === lastPoint.x && point.y === lastPoint.y) {
        requestOverlayRender()
        return
      }
      addStrokeSegment(lastPoint, point)
      lastPoint = point
      requestOverlayRender()
      return
    }

    requestOverlayRender()
  }

  const handleOverlayPointerUp = (event: PointerEvent): void => {
    if (props.activeTool() !== 'mask') return
    stopBrushDrawing(event)
  }

  const handleOverlayPointerLeave = (event: PointerEvent): void => {
    if (props.activeTool() !== 'mask') return
    if (isDrawing) {
      stopBrushDrawing(event)
      return
    }
    lastPointerClient = null
    setHoverPoint(null)
    requestOverlayRender()
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (props.activeTool() === 'mask' && props.segmentationMode() === 'instance') {
      if (event.code === 'Space') {
        event.preventDefault()
        commitSessionPolygon()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        resetBrushSession()
        return
      }
    }

    if (props.activeTool() === 'mask' && props.segmentationMode() === 'semantic') {
      if (event.key === 'Escape') {
        event.preventDefault()
        resetBrushSession()
        return
      }
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      if (props.segmentationMode() === 'instance') {
        props.store.deleteSelected()
      }
      return
    }

    const store = props.segmentationMode() === 'semantic' ? props.semanticStore : props.store
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) store?.redo()
      else store?.undo()
    }
  }

  createEffect(() => {
    const viewport = props.viewportRef()
    if (!viewport) return
    viewport.addEventListener('keydown', handleKeyDown)
    onCleanup(() => viewport.removeEventListener('keydown', handleKeyDown))
  })

  onCleanup(() => {
    stopInteraction()
    if (renderFrame) cancelAnimationFrame(renderFrame)
    segmentationWorker?.terminate()
    segmentationWorker = null
    pendingSegmentationRequests.clear()
    brushEngine?.dispose()
    brushEngine = null
  })

  const layerStyle = createMemo(() => {
    const transform = props.transform()
    return {
      transform: `translate(${transform.panX}px, ${transform.panY}px) scale(${transform.scale})`,
      'transform-origin': '0 0'
    }
  })

  const draftLabelColor = createMemo(() => {
    const labelId = props.activeLabelId()
    if (!labelId) return '#ffffff'
    return labelMap().get(labelId)?.color ?? '#ffffff'
  })

  return (
    <Show when={props.imageSize()}>
      {(size) => (
        <div
          ref={overlayRef}
          class="pointer-events-auto absolute top-0 left-0 isolate z-2"
          style={{
            width: `${size().width}px`,
            height: `${size().height}px`,
            ...layerStyle()
          }}
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
          onPointerLeave={handleOverlayPointerLeave}
          onContextMenu={(event) => {
            if (props.activeTool() === 'mask') event.preventDefault()
          }}
        >
          <Show when={props.segmentationMode() === 'instance'}>
            <canvas
              ref={glCanvasRef}
              class="annotation-gl-canvas pointer-events-none absolute top-0 left-0 z-1 h-full w-full"
            />
          </Show>
          <Show when={props.segmentationMode() === 'semantic'}>
            <canvas
              ref={semanticCanvasRef}
              class="annotation-gl-canvas pointer-events-none absolute top-0 left-0 z-1 h-full w-full"
            />
          </Show>
          <svg
            class="pointer-events-none absolute top-0 left-0 z-2 h-full w-full overflow-visible"
            width={size().width}
            height={size().height}
            viewBox={`0 0 ${size().width} ${size().height}`}
          >
            <For each={rectangles()}>
              {(rect) => {
                const label = (): Label | undefined => labelMap().get(rect.labelId)
                const selected = (): boolean => props.store.selectedShapeId[0]() === rect.id
                return (
                  <rect
                    x={rect.x}
                    y={rect.y}
                    width={rect.width}
                    height={rect.height}
                    fill={hexToRgba(
                      label()?.color ?? '#ffffff',
                      selected() ? SELECTED_SHAPE_OPACITY : SHAPE_OPACITY
                    )}
                    stroke={label()?.color ?? '#ffffff'}
                    stroke-width={selected() ? 2.5 : 1.5}
                  />
                )
              }}
            </For>
            <For each={polygons()}>
              {(polygon) => {
                const label = (): Label | undefined => labelMap().get(polygon.labelId)
                const selected = (): boolean => props.store.selectedShapeId[0]() === polygon.id
                return (
                  <polygon
                    points={polygonPointsToSvg(polygon.points)}
                    fill={hexToRgba(
                      label()?.color ?? '#ffffff',
                      selected() ? SELECTED_SHAPE_OPACITY : SHAPE_OPACITY
                    )}
                    stroke={label()?.color ?? '#ffffff'}
                    stroke-width={selected() ? 2.5 : 1.5}
                  />
                )
              }}
            </For>
            <Show when={draftRect()}>
              {(rect) => (
                <rect
                  x={rect().x}
                  y={rect().y}
                  width={rect().width}
                  height={rect().height}
                  fill={hexToRgba(draftLabelColor(), SHAPE_OPACITY)}
                  stroke={draftLabelColor()}
                  stroke-width={1.5}
                  stroke-dasharray="4 3"
                />
              )}
            </Show>
            <Show when={brushSvgPreview()}>
              {(preview) => (
                <For each={preview().pixels}>
                  {(pixel) => (
                    <rect
                      x={pixel.x}
                      y={pixel.y}
                      width={1}
                      height={1}
                      fill="#ffffff"
                      fill-opacity={preview().opacity}
                    />
                  )}
                </For>
              )}
            </Show>
          </svg>
        </div>
      )}
    </Show>
  )
}

export default AnnotationOverlay
