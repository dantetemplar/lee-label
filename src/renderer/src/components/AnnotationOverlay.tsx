import type { Component } from 'solid-js'
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js'
import type { Label } from '../../../shared/annotations'
import {
  SELECTED_SHAPE_OPACITY,
  SHAPE_OPACITY,
  HOVERED_SHAPE_OPACITY
} from '../../../shared/annotations'
import type { Point2D } from '../../../shared/geometry'
import { hexToRgbNormalized } from '../../../shared/label-color'
import type { SegmentationMode } from '../../../shared/segmentation'
import { POLYGON_SIMPLIFICATION, POLYGON_SIMPLIFICATION_EDIT } from '../../../shared/segmentation'
import type { RectCorner, ViewTransform } from '../lib/annotation-coords'
import {
  boundsIntersect,
  clampToImage,
  hitTestMaskBounds,
  hitTestPolygon,
  hitTestRectangle,
  hitTestRectangleCorner,
  isBoundsFullyVisible,
  normalizeRectFromPoints,
  oppositeRectCorner,
  rectangleCornerPoints,
  rectanglesIntersect,
  shapeBounds,
  snapPointToImagePixel,
  viewportToImage
} from '../lib/annotation-coords'
import type { WorkingShape } from '../lib/annotation-store'
import { AnnotationStore } from '../lib/annotation-store'
import { BrushEngine, type SavedMaskLayer } from '../lib/brush/brush-engine'
import {
  applyManualIssueGuesses,
  createBrushSessionState,
  resetBrushSessionState
} from '../lib/brush/brush-session'
import { forEachPixelBrushPixel, usesPixelBrushShape } from '../lib/brush/brush-shapes'
import {
  BRUSH_PREVIEW_FILLED_OPACITY,
  COMMITTED_MASK_OPACITY,
  getBrushPreviewSettings,
  getEffectiveBrushDiameter,
  usesSvgBrushPreview
} from '../lib/brush/constants'
import {
  eraseCapsuleFromMaskData,
  erasePixelBrushStrokeFromMaskData,
  expandMaskBitmap,
  tightenMaskBitmap
} from '../lib/mask-bitmap'
import { rasterizePolygon } from '../lib/polygon/rasterize'
import {
  TopologySession,
  topologyHintsFromIssues,
  type TopologyAlert
} from '../lib/polygon/topology-session'
import type { TopologyIssueMask } from '../lib/polygon/worker-types'
import { useProjectContext } from '../lib/project-context'
import { isShortcutBlockedTarget } from '../lib/shortcut-guards'
import { hasAltKey } from '../lib/pressed-keys'
import { renderSemanticOverlay, stampClassIdStroke } from '../lib/semantic-class-map'
import type { SemanticMapStore } from '../lib/semantic-map-store'
import AnnotationShapeLayer from './AnnotationShapeLayer'
import type { AnnotationTool } from './AnnotationToolbar'
import { samPipeline } from '../lib/sam/sam-pipeline'
import type { Point as SamPoint } from '../lib/sam/types'
import { isSameImageSrc } from '../lib/image-layer-cache'
import { toLocalImageUrl } from '../lib/local-image-url'

export type { TopologyAlert }

const MIN_RECT_SIZE = 3
const CORNER_HIT_SCREEN_PX = 10

function findShapeAtPoint(shapes: WorkingShape[], x: number, y: number): WorkingShape | null {
  for (let index = shapes.length - 1; index >= 0; index--) {
    const shape = shapes[index]
    if (shape.type === 'rectangle' && hitTestRectangle(x, y, shape)) return shape
    if (shape.type === 'mask' && hitTestMaskBounds(x, y, shape.bounds)) return shape
    if (shape.type === 'polygon' && hitTestPolygon(x, y, shape.points)) return shape
  }
  return null
}

function findRectangleCornerHit(
  shapes: WorkingShape[],
  x: number,
  y: number,
  radius: number
): { shape: WorkingShape & { type: 'rectangle' }; corner: RectCorner } | null {
  for (let index = shapes.length - 1; index >= 0; index--) {
    const shape = shapes[index]
    if (shape.type !== 'rectangle') continue
    const corner = hitTestRectangleCorner(x, y, shape, radius)
    if (corner) return { shape, corner }
  }
  return null
}

function cornerCursor(corner: RectCorner): string {
  return corner === 'ne' || corner === 'sw' ? 'nesw-resize' : 'nwse-resize'
}

const AnnotationOverlay: Component<{
  viewportRef: () => HTMLDivElement | undefined
  transform: () => ViewTransform
  imageSize: () => { width: number; height: number } | null
  getCurrentImage: () => HTMLImageElement | undefined
  imageKey: () => string | null
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
  const project = useProjectContext()
  let glCanvasRef: HTMLCanvasElement | undefined
  let semanticCanvasRef: HTMLCanvasElement | undefined
  let overlayRef: HTMLDivElement | undefined

  const [draftRect, setDraftRect] = createSignal<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const [draftMarquee, setDraftMarquee] = createSignal<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const [draftRectMode, setDraftRectMode] = createSignal<'draw' | 'erase'>('draw')
  const [pendingRectOrigin, setPendingRectOrigin] = createSignal<Point2D | null>(null)
  const [hoverPoint, setHoverPoint] = createSignal<Point2D | null>(null)
  const [topologyIssues, setTopologyIssues] = createSignal<TopologyIssueMask[]>([])
  const [editingShapeId, setEditingShapeId] = createSignal<string | null>(null)
  const [samDraftBox, setSamDraftBox] = createSignal<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)

  let lastPointerClient: { x: number; y: number } | null = null

  let dragMode:
    | 'none'
    | 'draw-rect'
    | 'finish-rect'
    | 'resize-rect'
    | 'erase-rect'
    | 'marquee-select'
    | 'sam-box' = 'none'
  let dragStart = { x: 0, y: 0 }
  let marqueeAdditive = false
  let resizeShapeId: string | null = null
  let resizeAnchor = { x: 0, y: 0 }
  let rectPointerId: number | null = null

  const cornerHitRadius = (): number =>
    Math.max(MIN_RECT_SIZE, CORNER_HIT_SCREEN_PX / props.transform().scale)

  const clearRectDraft = (): void => {
    setPendingRectOrigin(null)
    setDraftRect(null)
    setDraftRectMode('draw')
  }

  const clearMarqueeDraft = (): void => {
    setDraftMarquee(null)
    marqueeAdditive = false
  }

  const commitRectangleAt = (rect: {
    x: number
    y: number
    width: number
    height: number
  }): boolean => {
    const labelId = props.activeLabelId()
    if (!labelId || rect.width < MIN_RECT_SIZE || rect.height < MIN_RECT_SIZE) return false
    props.store.pushUndo()
    const shape = props.store.createRectangle(labelId, rect)
    props.store.setShapes([...props.store.shapes[0](), shape])
    clearRectDraft()
    return true
  }

  const stopRectPointerCapture = (): void => {
    if (rectPointerId !== null && overlayRef && overlayRef.hasPointerCapture(rectPointerId)) {
      overlayRef.releasePointerCapture(rectPointerId)
    }
    rectPointerId = null
  }

  const stopInteraction = (): void => {
    stopRectPointerCapture()
    dragMode = 'none'
    resizeShapeId = null
  }

  const captureRectPointer = (event: PointerEvent): void => {
    rectPointerId = event.pointerId
    overlayRef?.setPointerCapture(event.pointerId)
  }

  let brushEngine: BrushEngine | null = null
  const brushSession = createBrushSessionState()
  const topologySession = new TopologySession()
  const nextTopologyIssueMaskId = { current: 0 }
  let renderFrame = 0
  let isCommitProcessing = false

  const labelMap = createMemo(() => new Map(props.labels().map((label) => [label.id, label])))
  const classColorMap = createMemo(
    () => new Map(props.labels().map((label) => [label.classId, label.color]))
  )
  const topologyHints = createMemo(() => topologyHintsFromIssues(topologyIssues()))

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
    const point = lastPointerClient
      ? getImagePointAt(lastPointerClient.x, lastPointerClient.y)
      : null

    if (isAltSelectMode()) {
      updateAltSelectHover(point)
      return
    }

    if (props.activeTool() === 'mask') {
      setHoverPoint(point)
      restoreToolOverlayCursor(point)
      return
    }

    restoreToolOverlayCursor(point)
  }

  const isAltSelectMode = (): boolean => {
    if (props.segmentationMode() !== 'instance') return false
    const tool = props.activeTool()
    if (tool !== 'rectangle' && tool !== 'mask' && tool !== 'magic-stick') return false
    return hasAltKey(project.pressedKeys())
  }

  const restoreToolOverlayCursor = (point: Point2D | null): void => {
    if (!overlayRef) return

    const tool = props.activeTool()
    if (tool === 'rectangle' && props.segmentationMode() === 'instance') {
      props.store.setHoveredShapeId(null)
      let cornerHit: RectCorner | null = null
      if (point && pendingRectOrigin() == null) {
        cornerHit =
          findRectangleCornerHit(props.store.shapes[0](), point.x, point.y, cornerHitRadius())
            ?.corner ?? null
      }
      overlayRef.style.cursor = cornerHit ? cornerCursor(cornerHit) : 'crosshair'
      return
    }

    if (tool === 'magic-stick' && props.segmentationMode() === 'instance') {
      props.store.setHoveredShapeId(null)
      overlayRef.style.cursor = 'crosshair'
      return
    }

    if (
      tool === 'mask' &&
      props.segmentationMode() === 'instance' &&
      updateSelectedRectangleCornerCursor(point)
    ) {
      return
    }

    props.store.setHoveredShapeId(null)
    overlayRef.style.cursor = ''
  }

  const updateAltSelectHover = (point: Point2D | null): void => {
    if (!point) {
      props.store.setHoveredShapeId(null)
      if (overlayRef) overlayRef.style.cursor = isAltSelectMode() ? 'pointer' : ''
      return
    }

    const hit = findShapeAtPoint(props.store.shapes[0](), point.x, point.y)
    props.store.setHoveredShapeId(hit?.id ?? null)
    if (overlayRef) overlayRef.style.cursor = 'pointer'
  }

  const handleShapeSelectionPointerDown = (event: PointerEvent, point: Point2D): void => {
    const hit = findShapeAtPoint(props.store.shapes[0](), point.x, point.y)
    if (hit) {
      if (event.ctrlKey || event.metaKey) {
        props.store.toggleSelect(hit.id)
        if (props.store.isSelected(hit.id)) project.setActiveLabelId(hit.labelId)
      } else {
        props.store.selectOnly(hit.id)
        project.setActiveLabelId(hit.labelId)
      }
      return
    }

    if (!event.ctrlKey && !event.metaKey) {
      props.store.clearSelection()
    }
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
    if (props.activeTool() !== 'mask' || isAltSelectMode()) return null
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
    const editingId = editingShapeId()
    const selectedIds = new Set(props.store.selectedShapeIds[0]())
    const hoveredId = props.store.hoveredShapeId[0]()
    const masks = props.store.shapes[0]().filter(
      (shape): shape is Extract<WorkingShape, { type: 'mask' }> =>
        shape.type === 'mask' && shape.id !== editingId
    )
    masks.sort((left, right) => left.zOrder - right.zOrder)

    return masks.map((shape) => {
      const label = labelMap().get(shape.labelId)
      const opacity = selectedIds.has(shape.id)
        ? SELECTED_SHAPE_OPACITY
        : shape.id === hoveredId
          ? HOVERED_SHAPE_OPACITY
          : COMMITTED_MASK_OPACITY
      return {
        id: shape.id,
        version: shape.updatedAt,
        bounds: shape.bounds,
        data: shape.data,
        colorRgb: hexToRgbNormalized(label?.color ?? '#ffffff'),
        opacity
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
      brushSession.isDrawing = false
      brushSession.activePointerId = null
      brushSession.strokeSegments = []
      brushSession.lastPoint = null
      brushSession.sessionUndoPushed = false
      brushSession.semanticUndoPushed = false
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

    const maskToolActive = props.activeTool() === 'mask' && !isAltSelectMode()
    const hover = hoverPoint()
    const previewRadius = brushRadiusImagePx()
    const correctingTopologyIssue =
      brushSession.isDrawing &&
      topologyIssues().some((issue) =>
        brushSession.brushStrokeMode === 'paint' ? issue.kind === 'hole' : issue.kind === 'island'
      )
    const labelColor = hexToRgbNormalized(activeLabelColor())
    const activeStrokeColor = correctingTopologyIssue
      ? ([0.13, 0.65, 0.35] as [number, number, number])
      : labelColor
    const activeOutsideStrokeColor =
      brushSession.brushStrokeMode === 'erase'
        ? ([1, 1, 1] as [number, number, number])
        : labelColor
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
    resetBrushSessionState(brushSession)
    clearTopologyAlert()
    brushEngine?.clearBrushOverlays()
    requestOverlayRender()
  }

  const loadSelectedShapeForEditing = (): void => {
    setEditingShapeId(null)

    const tool = props.activeTool()
    if (
      (tool !== 'mask' && tool !== 'magic-stick') ||
      props.segmentationMode() !== 'instance'
    ) {
      return
    }

    const selectedId = props.store.primarySelectedId()
    if (!selectedId) return

    const shape = props.store.shapes[0]().find((item) => item.id === selectedId)
    if (!shape || (shape.type !== 'polygon' && shape.type !== 'mask')) return

    const size = props.imageSize()
    const engine = ensureBrushEngine()
    if (!size || !engine) return

    const mask =
      shape.type === 'polygon'
        ? rasterizePolygon(shape.points, size.width, size.height)
        : expandMaskBitmap(shape.data, shape.bounds.width, shape.bounds, size.width, size.height)

    if (!mask.some((value) => value > 0)) return

    engine.loadSessionMask(mask)
    setEditingShapeId(shape.id)
    project.setActiveLabelId(shape.labelId)
    if (tool === 'magic-stick') {
      samPipeline.clearPrompts()
      setSamDraftBox(null)
    }
    requestOverlayRender()
  }

  const clearTopologyAlert = (): void => {
    setTopologyIssues([])
    props.onTopologyAlertChange?.(null)
  }

  const releaseActivePointerCapture = (): void => {
    if (
      overlayRef &&
      brushSession.activePointerId !== null &&
      overlayRef.hasPointerCapture(brushSession.activePointerId)
    ) {
      overlayRef.releasePointerCapture(brushSession.activePointerId)
    }
    brushSession.activePointerId = null
  }

  const finalizeStrokeAfterCommit = (): void => {
    brushSession.strokeSegments = []
    brushSession.lastPoint = null
    brushSession.isDrawing = false
    releaseActivePointerCapture()
    brushEngine?.clearBrushOverlays()
  }

  const showTopologyAlert = (message: string, issues: TopologyIssueMask[] = []): void => {
    setTopologyIssues(issues)
    props.onTopologyAlertChange?.({
      message,
      onDismiss: () => {
        brushSession.topologyCommitAttempt = 0
        clearTopologyAlert()
      }
    })
  }

  const eraseFromSavedMasks = (from: Point2D, to: Point2D): void => {
    const size = props.imageSize()
    if (!size) return

    const editingId = editingShapeId()
    let changed = false
    for (const shape of props.store.shapes[0]()) {
      if (shape.type !== 'mask') continue
      if (shape.id === editingId) continue
      const erased = usesPixelBrushShape(brushSession.lockedBrushDiameterImagePx)
        ? erasePixelBrushStrokeFromMaskData(
            shape.data,
            shape.bounds,
            from,
            to,
            brushSession.lockedBrushDiameterImagePx
          )
        : eraseCapsuleFromMaskData(
            shape.data,
            shape.bounds,
            from,
            to,
            brushSession.lockedBrushDiameterImagePx / 2
          )
      if (erased) changed = true
    }

    if (changed) {
      brushSession.savedMasksErased = true
      requestOverlayRender()
    }
  }

  const finalizeErasedMasks = (): void => {
    if (!brushSession.savedMasksErased) return

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
    brushSession.savedMasksErased = false
  }

  const addStrokeSegment = (from: Point2D, to: Point2D): void => {
    const segment = { from, to }
    brushSession.strokeSegments.push(segment)

    if (props.segmentationMode() === 'semantic') {
      const store = props.semanticStore
      const size = props.imageSize()
      const map = store?.getMutableClassMap()
      if (!store || !size || !map) return
      const classId = brushSession.brushStrokeMode === 'erase' ? 0 : activeClassId()
      const next = new Uint16Array(map)
      stampClassIdStroke(
        next,
        size.width,
        size.height,
        from,
        to,
        brushSession.lockedBrushDiameterImagePx,
        classId
      )
      store.setClassMap(next)
      requestOverlayRender()
      return
    }

    if (usesPixelBrushShape(brushSession.lockedBrushDiameterImagePx)) {
      if (brushSession.brushStrokeMode === 'erase') {
        brushEngine?.stampPixelBrushStroke(
          from,
          to,
          brushSession.lockedBrushDiameterImagePx,
          'session',
          'erase'
        )
        brushEngine?.stampPixelBrushStroke(
          from,
          to,
          brushSession.lockedBrushDiameterImagePx,
          'active',
          'paint'
        )
        eraseFromSavedMasks(from, to)
        return
      }

      brushEngine?.stampPixelBrushStroke(
        from,
        to,
        brushSession.lockedBrushDiameterImagePx,
        'active',
        'paint'
      )
      return
    }

    const radius = brushSession.lockedBrushDiameterImagePx / 2
    if (brushSession.brushStrokeMode === 'erase') {
      brushEngine?.stampCapsule(from, to, radius, 'session', 'erase')
      brushEngine?.stampCapsule(from, to, radius, 'active', 'paint')
      eraseFromSavedMasks(from, to)
      return
    }

    brushEngine?.stampCapsule(from, to, radius, 'active', 'paint')
  }

  const stampPendingStrokeToSession = (): void => {
    if (brushSession.strokeSegments.length === 0 || brushSession.brushStrokeMode !== 'paint') return

    if (usesPixelBrushShape(brushSession.lockedBrushDiameterImagePx)) {
      brushEngine?.stampPixelBrushStrokes(
        brushSession.strokeSegments,
        brushSession.lockedBrushDiameterImagePx,
        'session',
        'paint'
      )
    } else {
      brushEngine?.stampCapsules(
        brushSession.strokeSegments,
        brushSession.lockedBrushDiameterImagePx / 2,
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
    if (brushSession.brushStrokeMode === 'erase') {
      engine.clearActiveStroke()
    }

    const editingId = editingShapeId()
    const existing = editingId
      ? props.store.shapes[0]().find((shape) => shape.id === editingId)
      : undefined

    // Editing an unchanged loaded shape — exit brush mode without mask→polygon round-trip.
    const hasUserPixelEdits =
      brushSession.isDrawing ||
      brushSession.strokeSegments.length > 0 ||
      brushSession.sessionUndoPushed ||
      brushSession.savedMasksErased ||
      engine.hasActiveContent()
    if (existing && !hasUserPixelEdits) {
      props.store.clearSelection()
      setEditingShapeId(null)
      resetBrushSession()
      flushOverlayRender()
      return
    }

    if (!engine.hasCommitContent()) {
      if (existing) {
        if (!brushSession.sessionUndoPushed) props.store.pushUndo()
        props.store.setShapes(props.store.shapes[0]().filter((shape) => shape.id !== existing.id))
        props.store.clearSelection()
        setEditingShapeId(null)
        resetBrushSession()
      }
      return
    }

    const raw = engine.readCommitMask()
    if (!raw) {
      return
    }

    isCommitProcessing = true
    const generation = brushSession.segmentationGeneration
    try {
      const result = await topologySession.convertMask(
        raw,
        size.width,
        size.height,
        brushSession.topologyCommitAttempt === 1,
        existing ? POLYGON_SIMPLIFICATION_EDIT : POLYGON_SIMPLIFICATION
      )
      if (generation !== brushSession.segmentationGeneration) return

      if (result.issues.length > 0) {
        if (topologyIssues().length === 0) {
          setTopologyIssues(result.issues)
        }
        brushSession.topologyCommitAttempt = 1
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

      if (!brushSession.sessionUndoPushed) props.store.pushUndo()

      const created = props.store.createPolygon(labelId, result.polygon)
      if (existing) {
        props.store.setShapes(
          props.store.shapes[0]().map((shape) =>
            shape.id === existing.id
              ? {
                  ...created,
                  id: existing.id,
                  zOrder: existing.zOrder,
                  createdAt: existing.createdAt,
                  labelId
                }
              : shape
          )
        )
      } else {
        props.store.setShapes([...props.store.shapes[0](), created])
      }
      props.store.clearSelection()
      finalizeStrokeAfterCommit()
      brushSession.sessionUndoPushed = false
      brushSession.topologyCommitAttempt = 0
      clearTopologyAlert()
      setEditingShapeId(null)
      if (props.activeTool() === 'magic-stick') {
        samPipeline.clearPrompts()
        setSamDraftBox(null)
      }
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
    props.store.selectedShapeIds[0]()
    props.store.hoveredShapeId[0]()
    props.semanticStore?.classMap[0]()
    props.labels()
    props.imageSize()
    requestOverlayRender()
  })

  let lastEngineWidth = 0
  let lastEngineHeight = 0

  createEffect(() => {
    const size = props.imageSize()
    if (!size) return
    if (brushEngine && size.width === lastEngineWidth && size.height === lastEngineHeight) {
      return
    }
    lastEngineWidth = size.width
    lastEngineHeight = size.height
    brushEngine?.dispose()
    brushEngine = null
    setEditingShapeId(null)
    resetBrushSession()
  })

  createEffect(
    on(
      () =>
        [
          props.activeTool(),
          props.segmentationMode(),
          props.store.selectedShapeIds[0](),
          props.imageSize()?.width ?? 0,
          props.imageSize()?.height ?? 0
        ] as const,
      () => {
        lastPointerClient = null
        setHoverPoint(null)
        props.store.setHoveredShapeId(null)
        resetBrushSession()
        queueMicrotask(() => {
          loadSelectedShapeForEditing()
          requestOverlayRender()
          const viewport = props.viewportRef()
          const tool = props.activeTool()
          if (
            (tool === 'mask' || tool === 'magic-stick') &&
            viewport &&
            document.activeElement !== viewport
          ) {
            viewport.focus({ preventScroll: true })
          }
        })
      }
    )
  )

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

  createEffect(() => {
    project.pressedKeys()
    props.activeTool()
    syncHoverFromLastPointer()
    requestOverlayRender()
  })

  const stopBrushDrawing = (): void => {
    if (!brushSession.isDrawing) return

    brushSession.isDrawing = false
    releaseActivePointerCapture()

    if (props.segmentationMode() === 'semantic') {
      brushSession.semanticUndoPushed = false
      brushSession.strokeSegments = []
      brushSession.lastPoint = null
      brushSession.brushStrokeMode = 'paint'
      requestOverlayRender()
      return
    }

    if (brushSession.strokeSegments.length > 0) {
      brushSession.topologyCommitAttempt = 0
      const { nextIssues, didChange } = applyManualIssueGuesses(
        topologyIssues(),
        brushSession.strokeSegments,
        brushSession.brushStrokeMode,
        brushSession.lockedBrushDiameterImagePx,
        nextTopologyIssueMaskId
      )
      if (didChange) setTopologyIssues(nextIssues)
    }
    if (brushSession.strokeSegments.length > 0 && brushSession.brushStrokeMode === 'paint') {
      if (usesPixelBrushShape(brushSession.lockedBrushDiameterImagePx)) {
        brushEngine?.stampPixelBrushStrokes(
          brushSession.strokeSegments,
          brushSession.lockedBrushDiameterImagePx,
          'session',
          'paint'
        )
      } else {
        brushEngine?.stampCapsules(
          brushSession.strokeSegments,
          brushSession.lockedBrushDiameterImagePx / 2,
          'session',
          'paint'
        )
      }
    }
    if (brushSession.brushStrokeMode === 'erase') {
      finalizeErasedMasks()
    }
    brushEngine?.clearActiveStroke()
    brushSession.strokeSegments = []
    brushSession.lastPoint = null
    brushSession.brushStrokeMode = 'paint'
    requestOverlayRender()
  }

  const updateRectDrag = (point: Point2D): void => {
    if (dragMode === 'draw-rect' || dragMode === 'finish-rect' || dragMode === 'erase-rect') {
      setDraftRect(normalizeRectFromPoints(dragStart, point))
      return
    }

    if (dragMode === 'marquee-select') {
      setDraftMarquee(normalizeRectFromPoints(dragStart, point))
      return
    }

    if (dragMode !== 'resize-rect' || !resizeShapeId) return
    const next = normalizeRectFromPoints(resizeAnchor, point)
    const shapes = props.store.shapes[0]()
    props.store.setShapes(
      shapes.map((shape) => {
        if (shape.id !== resizeShapeId || shape.type !== 'rectangle') return shape
        return {
          ...shape,
          x: next.x,
          y: next.y,
          width: Math.max(next.width, 1),
          height: Math.max(next.height, 1)
        }
      })
    )
  }

  const eraseRectanglesIntersecting = (eraser: {
    x: number
    y: number
    width: number
    height: number
  }): void => {
    if (eraser.width < MIN_RECT_SIZE || eraser.height < MIN_RECT_SIZE) return
    const shapes = props.store.shapes[0]()
    const remaining = shapes.filter(
      (shape) => shape.type !== 'rectangle' || !rectanglesIntersect(eraser, shape)
    )
    if (remaining.length === shapes.length) return

    props.store.pushUndo()
    const selectedId = props.store.primarySelectedId()
    props.store.setShapes(remaining)
    if (selectedId && !remaining.some((shape) => shape.id === selectedId)) {
      props.store.clearSelection()
    }
  }

  const finishMarqueePointer = (point: Point2D | null): void => {
    const rect = point ? normalizeRectFromPoints(dragStart, point) : draftMarquee()
    if (!rect || (rect.width < MIN_RECT_SIZE && rect.height < MIN_RECT_SIZE)) {
      if (!marqueeAdditive) props.store.clearSelection()
    } else {
      const ids = props.store.shapes[0]()
        .filter((shape) => boundsIntersect(shapeBounds(shape), rect))
        .map((shape) => shape.id)
      if (marqueeAdditive) props.store.addToSelection(ids)
      else props.store.setSelectedShapeIds(ids)
    }
    clearMarqueeDraft()
    stopInteraction()
  }

  const finishRectPointer = (point: Point2D | null): void => {
    if (dragMode === 'marquee-select') {
      finishMarqueePointer(point)
      return
    }

    if (dragMode === 'draw-rect') {
      const rect = point ? normalizeRectFromPoints(dragStart, point) : draftRect()
      if (rect && rect.width >= MIN_RECT_SIZE && rect.height >= MIN_RECT_SIZE) {
        commitRectangleAt(rect)
      } else {
        setDraftRectMode('draw')
        setPendingRectOrigin(dragStart)
        setDraftRect({ x: dragStart.x, y: dragStart.y, width: 0, height: 0 })
      }
      stopInteraction()
      return
    }

    if (dragMode === 'finish-rect') {
      const rect = point ? normalizeRectFromPoints(dragStart, point) : draftRect()
      if (rect) {
        if (!commitRectangleAt(rect)) {
          setDraftRect(rect)
        }
      }
      stopInteraction()
      return
    }

    if (dragMode === 'erase-rect') {
      const rect = point ? normalizeRectFromPoints(dragStart, point) : draftRect()
      if (rect) eraseRectanglesIntersecting(rect)
      clearRectDraft()
      stopInteraction()
      return
    }

    if (dragMode === 'resize-rect') {
      props.store.markDirty()
      stopInteraction()
    }
  }

  const beginRectangleCornerResize = (
    event: PointerEvent,
    shape: WorkingShape & { type: 'rectangle' },
    corner: RectCorner
  ): void => {
    props.store.pushUndo()
    dragMode = 'resize-rect'
    resizeShapeId = shape.id
    resizeAnchor = rectangleCornerPoints(shape)[oppositeRectCorner(corner)]
    captureRectPointer(event)
  }

  const getSoleSelectedRectangle = (): (WorkingShape & { type: 'rectangle' }) | null => {
    const selectedId = props.store.primarySelectedId()
    if (!selectedId || props.store.selectedShapeIds[0]().length !== 1) return null
    const selected = props.store.shapes[0]().find((shape) => shape.id === selectedId)
    return selected?.type === 'rectangle' ? selected : null
  }

  const tryBeginSelectedRectangleCornerResize = (event: PointerEvent, point: Point2D): boolean => {
    const selected = getSoleSelectedRectangle()
    if (!selected) return false
    const corner = hitTestRectangleCorner(point.x, point.y, selected, cornerHitRadius())
    if (!corner) return false
    beginRectangleCornerResize(event, selected, corner)
    return true
  }

  const updateSelectedRectangleCornerCursor = (point: Point2D | null): boolean => {
    if (!overlayRef || !point) return false
    const selected = getSoleSelectedRectangle()
    if (!selected) return false
    const corner = hitTestRectangleCorner(point.x, point.y, selected, cornerHitRadius())
    if (!corner) return false
    overlayRef.style.cursor = cornerCursor(corner)
    props.store.setHoveredShapeId(selected.id)
    return true
  }

  const applySamResultToSession = async (): Promise<void> => {
    const size = props.imageSize()
    if (!size) return
    await samPipeline.decodeCurrentPrompts(size.width, size.height)
    const raw = samPipeline.getBestMaskBitmap()
    if (!raw) return

    const engine = ensureBrushEngine()
    if (!engine) return

    if (!brushSession.sessionUndoPushed) {
      props.store.pushUndo()
      brushSession.sessionUndoPushed = true
    }

    engine.loadSessionMask(raw)
    clearTopologyAlert()
    requestOverlayRender()
  }

  const ensureSamEncoded = async (): Promise<boolean> => {
    const image = props.getCurrentImage()
    const key = props.imageKey()
    if (!image || !key || image.naturalWidth === 0) return false
    if (!isSameImageSrc(image, toLocalImageUrl(key))) return false
    return samPipeline.encodeImage(image, key)
  }

  const addSamPointAndDecode = async (point: Point2D, label: 0 | 1): Promise<void> => {
    if (!props.activeLabelId()) return
    const encoded = await ensureSamEncoded()
    if (!encoded) return
    const samPoint: SamPoint = { x: point.x, y: point.y, label }
    samPipeline.addPoint(samPoint)
    await applySamResultToSession()
  }

  const handleOverlayPointerDown = (event: PointerEvent): void => {
    if (isAltSelectMode()) {
      if (event.button !== 0) return
      event.preventDefault()
      const point = getImagePoint(event)
      if (!point) return
      handleShapeSelectionPointerDown(event, point)
      return
    }

    if (props.activeTool() === 'magic-stick' && props.segmentationMode() === 'instance') {
      if (event.button !== 0 && event.button !== 2) return
      event.preventDefault()
      const point = getImagePoint(event)
      if (!point) return
      if (!props.activeLabelId()) return

      if (event.button === 2) {
        void addSamPointAndDecode(point, 0)
        return
      }

      dragMode = 'sam-box'
      dragStart = point
      setSamDraftBox({ x: point.x, y: point.y, width: 0, height: 0 })
      overlayRef?.setPointerCapture(event.pointerId)
      rectPointerId = event.pointerId
      return
    }

    if (props.activeTool() === 'mask') {
      if (event.button === 0 && props.segmentationMode() === 'instance' && dragMode === 'none') {
        const point = getImagePoint(event)
        if (point && tryBeginSelectedRectangleCornerResize(event, point)) {
          event.preventDefault()
          return
        }
      }

      if (event.button !== 0 && event.button !== 2) return
      if (props.segmentationMode() === 'instance' && isCommitProcessing) return

      event.preventDefault()
      brushSession.brushStrokeMode = event.button === 2 ? 'erase' : 'paint'

      const point = getImagePoint(event)
      const labelId = props.activeLabelId()
      if (!point) return
      if (props.segmentationMode() === 'instance' && !ensureBrushEngine()) return
      if (brushSession.brushStrokeMode === 'paint' && !labelId) return

      if (props.segmentationMode() === 'semantic') {
        if (!brushSession.semanticUndoPushed) {
          props.semanticStore?.pushUndo()
          brushSession.semanticUndoPushed = true
        }
      } else if (!brushSession.sessionUndoPushed) {
        props.store.pushUndo()
        brushSession.sessionUndoPushed = true
      }

      overlayRef?.setPointerCapture(event.pointerId)
      brushSession.activePointerId = event.pointerId
      brushSession.isDrawing = true
      brushSession.savedMasksErased = false
      setHoverPoint(point)
      brushSession.strokeSegments = []
      brushSession.lockedBrushDiameterImagePx = effectiveBrushDiameter()
      brushEngine?.clearActiveStroke()
      addStrokeSegment(point, point)
      brushSession.lastPoint = point
      requestOverlayRender()
      return
    }

    if (event.button !== 0 && event.button !== 2) return
    if (dragMode !== 'none') return

    const tool = props.activeTool()

    if (tool === 'rectangle' && props.segmentationMode() === 'instance' && event.button === 2) {
      event.preventDefault()
      const point = getImagePoint(event)
      if (!point) return
      clearRectDraft()
      dragMode = 'erase-rect'
      dragStart = point
      setDraftRectMode('erase')
      setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 })
      captureRectPointer(event)
      return
    }

    if (event.button !== 0) return

    event.preventDefault()
    const point = getImagePoint(event)
    if (!point) return

    if (tool === 'cursor') {
      const point = getImagePoint(event)
      if (!point) return

      if (tryBeginSelectedRectangleCornerResize(event, point)) return

      const hit = findShapeAtPoint(props.store.shapes[0](), point.x, point.y)
      if (hit) {
        if (event.ctrlKey || event.metaKey) {
          props.store.toggleSelect(hit.id)
          if (props.store.isSelected(hit.id)) project.setActiveLabelId(hit.labelId)
        } else {
          props.store.selectOnly(hit.id)
          project.setActiveLabelId(hit.labelId)
        }
        return
      }

      marqueeAdditive = event.ctrlKey || event.metaKey
      dragMode = 'marquee-select'
      dragStart = point
      setDraftMarquee({ x: point.x, y: point.y, width: 0, height: 0 })
      captureRectPointer(event)
      return
    }

    if (tool === 'rectangle' && props.segmentationMode() === 'instance') {
      const pendingOrigin = pendingRectOrigin()
      if (!pendingOrigin) {
        const cornerHit = findRectangleCornerHit(
          props.store.shapes[0](),
          point.x,
          point.y,
          cornerHitRadius()
        )
        if (cornerHit) {
          beginRectangleCornerResize(event, cornerHit.shape, cornerHit.corner)
          return
        }
      }

      if (pendingOrigin) {
        // Second LMB click: press now, commit on release.
        dragMode = 'finish-rect'
        dragStart = pendingOrigin
        setDraftRectMode('draw')
        setDraftRect(normalizeRectFromPoints(pendingOrigin, point))
        captureRectPointer(event)
        return
      }

      if (!props.activeLabelId()) return
      dragMode = 'draw-rect'
      dragStart = point
      setDraftRectMode('draw')
      setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 })
      captureRectPointer(event)
    }
  }

  const handleOverlayPointerMove = (event: PointerEvent): void => {
    lastPointerClient = { x: event.clientX, y: event.clientY }

    if (rectPointerId !== null && event.pointerId === rectPointerId && dragMode === 'sam-box') {
      const point = getImagePoint(event)
      if (point) setSamDraftBox(normalizeRectFromPoints(dragStart, point))
      return
    }

    if (rectPointerId !== null && event.pointerId === rectPointerId && dragMode !== 'none') {
      const point = getImagePoint(event)
      if (point) updateRectDrag(point)
      return
    }

    if (isAltSelectMode()) {
      updateAltSelectHover(getImagePoint(event))
      return
    }

    const tool = props.activeTool()

    if (tool === 'cursor') {
      const point = getImagePoint(event)
      if (!point) {
        props.store.setHoveredShapeId(null)
        if (overlayRef) overlayRef.style.cursor = ''
        return
      }

      if (updateSelectedRectangleCornerCursor(point)) return

      const hit = findShapeAtPoint(props.store.shapes[0](), point.x, point.y)
      props.store.setHoveredShapeId(hit?.id ?? null)
      if (overlayRef) overlayRef.style.cursor = ''
      return
    }

    if (tool === 'rectangle' && props.segmentationMode() === 'instance') {
      const point = getImagePoint(event)
      if (!point || !overlayRef) return

      const pendingOrigin = pendingRectOrigin()
      if (pendingOrigin && dragMode === 'none') {
        setDraftRect(normalizeRectFromPoints(pendingOrigin, point))
      }

      if (dragMode !== 'none') return
      restoreToolOverlayCursor(point)
      return
    }

    if (tool !== 'mask') return

    const point = getImagePoint(event)
    if (!point) {
      setHoverPoint(null)
      if (overlayRef) overlayRef.style.cursor = ''
      requestOverlayRender()
      return
    }

    if (updateSelectedRectangleCornerCursor(point)) {
      setHoverPoint(null)
      requestOverlayRender()
      return
    }

    if (overlayRef) overlayRef.style.cursor = ''

    setHoverPoint(point)

    if (brushSession.isDrawing && brushSession.lastPoint) {
      const coalesced =
        typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
      const samples = coalesced.length > 0 ? coalesced : [event]

      for (const sample of samples) {
        lastPointerClient = { x: sample.clientX, y: sample.clientY }
        const samplePoint = getImagePoint(sample)
        if (!samplePoint || !brushSession.lastPoint) continue
        if (
          samplePoint.x === brushSession.lastPoint.x &&
          samplePoint.y === brushSession.lastPoint.y
        ) {
          continue
        }
        addStrokeSegment(brushSession.lastPoint, samplePoint)
        brushSession.lastPoint = samplePoint
        setHoverPoint(samplePoint)
      }

      requestOverlayRender()
      return
    }

    requestOverlayRender()
  }

  const handleOverlayPointerUp = (event: PointerEvent): void => {
    if (rectPointerId !== null && event.pointerId === rectPointerId && dragMode === 'sam-box') {
      const allowedButton = event.type === 'pointercancel' || event.button === 0
      if (!allowedButton) return

      const point = getImagePoint(event) ?? dragStart
      const box = normalizeRectFromPoints(dragStart, point)
      dragMode = 'none'
      rectPointerId = null
      try {
        overlayRef?.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }

      if (box.width >= MIN_RECT_SIZE && box.height >= MIN_RECT_SIZE) {
        setSamDraftBox(null)
        void (async () => {
          if (!props.activeLabelId()) return
          const encoded = await ensureSamEncoded()
          if (!encoded) return
          samPipeline.setBox({
            x1: box.x,
            y1: box.y,
            x2: box.x + box.width,
            y2: box.y + box.height
          })
          await applySamResultToSession()
        })()
      } else {
        setSamDraftBox(null)
        void addSamPointAndDecode(point, 1)
      }
      return
    }

    if (rectPointerId !== null && event.pointerId === rectPointerId && dragMode !== 'none') {
      const allowedButton =
        event.type === 'pointercancel' ||
        event.button === 0 ||
        (event.button === 2 && dragMode === 'erase-rect')
      if (!allowedButton) return
      finishRectPointer(getImagePoint(event))
      return
    }

    if (props.activeTool() !== 'mask') return
    stopBrushDrawing()
  }

  const handleOverlayPointerLeave = (): void => {
    props.store.setHoveredShapeId(null)
    if (props.activeTool() !== 'mask') return
    if (brushSession.isDrawing) {
      stopBrushDrawing()
      return
    }
    lastPointerClient = null
    setHoverPoint(null)
    requestOverlayRender()
  }

  const hasCancellableBrushWork = (): boolean =>
    brushSession.isDrawing ||
    brushSession.strokeSegments.length > 0 ||
    brushSession.sessionUndoPushed ||
    brushSession.semanticUndoPushed ||
    brushSession.savedMasksErased ||
    topologyIssues().length > 0

  const hasCancellableRectWork = (): boolean =>
    dragMode === 'draw-rect' ||
    dragMode === 'finish-rect' ||
    dragMode === 'erase-rect' ||
    dragMode === 'resize-rect' ||
    dragMode === 'marquee-select' ||
    Boolean(draftRect()) ||
    Boolean(draftMarquee()) ||
    pendingRectOrigin() !== null

  const hasCancellableAnnotationWork = (): boolean => {
    if (hasCancellableRectWork()) return true
    if (props.activeTool() === 'mask' && hasCancellableBrushWork()) return true
    if (props.activeTool() === 'magic-stick') {
      return (
        hasCancellableBrushWork() ||
        samPipeline.promptPoints().length > 0 ||
        samPipeline.promptBox() !== null ||
        samDraftBox() !== null ||
        dragMode === 'sam-box'
      )
    }
    return false
  }

  const isInstanceNavTool = (): boolean => {
    const tool = props.activeTool()
    return tool === 'cursor' || tool === 'rectangle' || tool === 'mask' || tool === 'magic-stick'
  }

  const cycleSelection = (direction: 1 | -1): void => {
    const next = props.store.selectAdjacent(direction)
    if (!next) return
    project.setActiveLabelId(next.labelId)

    const viewport = props.viewportRef()
    if (!viewport) return
    const bounds = shapeBounds(next)
    const visible = isBoundsFullyVisible(
      bounds,
      props.transform(),
      viewport.clientWidth,
      viewport.clientHeight,
      8
    )
    if (!visible) project.focusShapeBounds(bounds)
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (isShortcutBlockedTarget(event.target)) return

    if (event.key === 'Escape') {
      if (project.cursorSidebarTab() === 'files' && props.activeTool() === 'cursor') {
        event.preventDefault()
        event.stopPropagation()
        project.setCursorSidebarTab('objects')
        return
      }
    }

    if (event.key === 'Escape') {
      if (hasCancellableRectWork()) {
        event.preventDefault()
        event.stopPropagation()
        stopInteraction()
        clearRectDraft()
        clearMarqueeDraft()
        return
      }

      if (props.activeTool() === 'mask' && hasCancellableBrushWork()) {
        event.preventDefault()
        event.stopPropagation()
        resetBrushSession()
        loadSelectedShapeForEditing()
        return
      }

      if (props.activeTool() === 'magic-stick') {
        if (
          hasCancellableBrushWork() ||
          samPipeline.promptPoints().length > 0 ||
          samPipeline.promptBox() !== null ||
          samDraftBox() !== null ||
          dragMode === 'sam-box'
        ) {
          event.preventDefault()
          event.stopPropagation()
          dragMode = 'none'
          rectPointerId = null
          setSamDraftBox(null)
          samPipeline.clearPrompts()
          resetBrushSession()
          return
        }
      }

      if (props.store.hasSelection()) {
        event.preventDefault()
        event.stopPropagation()
        props.store.clearSelection()
      }
      return
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      if (props.segmentationMode() === 'instance') {
        project.requestDeleteShapes()
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

  const handleInstanceNavKeyDown = (event: KeyboardEvent): void => {
    if (!isInstanceNavTool()) return
    if (props.segmentationMode() !== 'instance') return
    if (props.activeTool() === 'cursor' && project.cursorSidebarTab() === 'files') return
    if (isShortcutBlockedTarget(event.target)) return

    if (props.activeTool() === 'cursor') {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        props.store.selectAll()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!props.store.hasSelection()) return
        event.preventDefault()
        event.stopPropagation()
        project.requestDeleteShapes()
        return
      }
    }

    if (event.key === 'Escape') {
      if (hasCancellableAnnotationWork()) return
      if (!props.store.hasSelection()) return
      event.preventDefault()
      props.store.clearSelection()
      return
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return

    if (event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      cycleSelection(event.shiftKey ? -1 : 1)
    }
  }

  createEffect(() => {
    const tool = props.activeTool()
    if (
      (tool !== 'mask' && tool !== 'magic-stick') ||
      props.segmentationMode() !== 'instance'
    ) {
      return
    }

    const handleSpace = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' && event.key !== ' ') return
      if (isShortcutBlockedTarget(event.target)) return
      event.preventDefault()
      void commitSessionPolygon()
    }

    document.addEventListener('keydown', handleSpace)
    onCleanup(() => document.removeEventListener('keydown', handleSpace))
  })

  createEffect(() => {
    if (props.activeTool() !== 'magic-stick') {
      setSamDraftBox(null)
      samPipeline.clearPrompts()
    }
  })

  createEffect(
    on(
      () => props.imageKey(),
      (key) => {
        samPipeline.clearPrompts()
        samPipeline.invalidateEmbedding()
        setSamDraftBox(null)
        if (props.activeTool() !== 'magic-stick') return
        const size = props.imageSize()
        const image = props.getCurrentImage()
        if (!size || !key || !image || image.naturalWidth === 0) return
        if (!isSameImageSrc(image, toLocalImageUrl(key))) return
        void ensureSamEncoded()
      }
    )
  )

  createEffect(() => {
    if (props.activeTool() !== 'magic-stick') return
    const size = props.imageSize()
    const key = props.imageKey()
    const image = props.getCurrentImage()
    if (!size || !key || !image || image.naturalWidth === 0) return
    if (samPipeline.embeddingReady()) return
    void ensureSamEncoded()
  })

  createEffect(() => {
    if (props.activeTool() === 'rectangle') return
    clearRectDraft()
    if (overlayRef) overlayRef.style.cursor = ''
  })

  createEffect(() => {
    const viewport = props.viewportRef()
    if (!viewport) return
    viewport.addEventListener('keydown', handleKeyDown)
    onCleanup(() => viewport.removeEventListener('keydown', handleKeyDown))
  })

  createEffect(() => {
    if (!isInstanceNavTool()) return
    if (props.segmentationMode() !== 'instance') return
    document.addEventListener('keydown', handleInstanceNavKeyDown, true)
    onCleanup(() => document.removeEventListener('keydown', handleInstanceNavKeyDown, true))
  })

  onCleanup(() => {
    stopInteraction()
    if (renderFrame) cancelAnimationFrame(renderFrame)
    topologySession.dispose()
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
          onPointerCancel={handleOverlayPointerUp}
          onPointerLeave={handleOverlayPointerLeave}
          onContextMenu={(event) => {
            if (
              props.activeTool() === 'mask' ||
              props.activeTool() === 'rectangle' ||
              props.activeTool() === 'magic-stick'
            ) {
              event.preventDefault()
            }
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
          <Show when={props.activeTool() === 'magic-stick'}>
            <svg
              class="pointer-events-none absolute top-0 left-0 z-3 h-full w-full overflow-visible"
              width={size().width}
              height={size().height}
            >
              <Show when={samDraftBox()}>
                {(box) => (
                  <rect
                    x={box().x}
                    y={box().y}
                    width={box().width}
                    height={box().height}
                    fill="none"
                    stroke="#22c55e"
                    stroke-width={1.5 / props.transform().scale}
                    stroke-dasharray={`${4 / props.transform().scale} ${3 / props.transform().scale}`}
                  />
                )}
              </Show>
              <Show when={samPipeline.promptBox()}>
                {(box) => (
                  <rect
                    x={box().x1}
                    y={box().y1}
                    width={box().x2 - box().x1}
                    height={box().y2 - box().y1}
                    fill="none"
                    stroke="#22c55e"
                    stroke-width={1.5 / props.transform().scale}
                  />
                )}
              </Show>
              <For each={samPipeline.promptPoints()}>
                {(point) => (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={5 / props.transform().scale}
                    fill={point.label === 1 ? '#22c55e' : '#ef4444'}
                    stroke="#fff"
                    stroke-width={1.25 / props.transform().scale}
                  />
                )}
              </For>
            </svg>
          </Show>
          <AnnotationShapeLayer
            width={size().width}
            height={size().height}
            scale={props.transform().scale}
            activeTool={props.activeTool}
            store={props.store}
            labels={props.labels}
            activeLabelId={props.activeLabelId}
            hiddenShapeId={editingShapeId}
            draftMarquee={draftMarquee}
            draftRect={draftRect}
            draftRectMode={draftRectMode}
            brushSvgPreview={brushSvgPreview}
            altSelectMode={isAltSelectMode}
          />
        </div>
      )}
    </Show>
  )
}

export default AnnotationOverlay
