import type { Component } from 'solid-js'
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import type { Label, RectangleShape } from '../../../shared/annotations'
import { SELECTED_SHAPE_OPACITY, SHAPE_OPACITY } from '../../../shared/annotations'
import type { ViewTransform } from '../lib/annotation-coords'
import {
    clampToImage,
    computeMaskBounds,
    cropMaskBitmap,
    hitTestMaskBounds,
    hitTestRectangle,
    snapPointToImagePixel,
    viewportToImage
} from '../lib/annotation-coords'
import type { WorkingShape } from '../lib/annotation-store'
import { AnnotationStore } from '../lib/annotation-store'
import { BrushEngine, type CapsuleSegment, type Point2D, type SavedMaskLayer } from '../lib/brush/brush-engine'
import {
  BRUSH_PREVIEW_INNER_OPACITY,
  BRUSH_PREVIEW_INNER_STROKE_IMAGE_PX,
  BRUSH_PREVIEW_OUTER_OPACITY,
  BRUSH_PREVIEW_STROKE_IMAGE_PX
} from '../lib/brush/constants'
import type { AnnotationTool } from './AnnotationToolbar'

const MIN_RECT_SIZE = 3

function parseHexRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '')
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized
  const int = Number.parseInt(value, 16)
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255
  }
}

function hexToRgbNormalized(hex: string): [number, number, number] {
  const { r, g, b } = parseHexRgb(hex)
  return [r / 255, g / 255, b / 255]
}

function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = parseHexRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
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
  }
  return null
}

const AnnotationOverlay: Component<{
  viewportRef: () => HTMLDivElement | undefined
  transform: () => ViewTransform
  imageSize: () => { width: number; height: number } | null
  activeTool: () => AnnotationTool
  activeLabelId: () => string | null
  brushSize: () => number
  labels: () => Label[]
  store: AnnotationStore
}> = (props) => {
  let glCanvasRef: HTMLCanvasElement | undefined
  let overlayRef: HTMLDivElement | undefined

  const [draftRect, setDraftRect] = createSignal<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const [interacting, setInteracting] = createSignal(false)
  const [hoverPoint, setHoverPoint] = createSignal<Point2D | null>(null)

  let dragMode: 'none' | 'draw-rect' | 'move-rect' = 'none'
  let dragStart = { x: 0, y: 0 }
  let moveShapeId: string | null = null
  let moveOffset = { x: 0, y: 0 }

  let brushEngine: BrushEngine | null = null
  let isDrawing = false
  let strokeSegments: CapsuleSegment[] = []
  let lastPoint: Point2D | null = null
  let lockedBrushRadiusImagePx = 0
  let sessionUndoPushed = false
  let renderFrame = 0

  const labelMap = createMemo(() => new Map(props.labels().map((label) => [label.id, label])))
  const rectangles = createMemo(() =>
    props.store.shapes[0]().filter((shape): shape is RectangleShape => shape.type === 'rectangle')
  )

  const getImagePoint = (event: MouseEvent | PointerEvent): Point2D | null => {
    const viewport = props.viewportRef()
    const size = props.imageSize()
    if (!viewport || !size) return null
    const point = viewportToImage(
      event.clientX,
      event.clientY,
      viewport.getBoundingClientRect(),
      props.transform()
    )
    return snapPointToImagePixel(
      clampToImage(point.x, point.y, size.width, size.height),
      size.width,
      size.height
    )
  }

  const brushRadiusImagePx = (): number => props.brushSize() / 2

  const activeLabelColor = createMemo(() => {
    const labelId = props.activeLabelId()
    if (!labelId) return '#ffffff'
    return labelMap().get(labelId)?.color ?? '#ffffff'
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
      strokeSegments = []
      lastPoint = null
      sessionUndoPushed = false
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

  const requestOverlayRender = (): void => {
    if (renderFrame) return
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0
      renderOverlay()
    })
  }

  const renderOverlay = (): void => {
    const engine = ensureBrushEngine()
    if (!engine) return

    const maskToolActive = props.activeTool() === 'mask'
    const hover = hoverPoint()
    const previewRadius = brushRadiusImagePx()
    const color = activeLabelColor()

    engine.renderScene(
      savedMaskLayers(),
      hexToRgbNormalized(color),
      maskToolActive && Boolean(hover),
      hover
        ? {
            center: hover,
            radiusPx: previewRadius,
            strokeWidthPx: BRUSH_PREVIEW_STROKE_IMAGE_PX,
            innerStrokeWidthPx: BRUSH_PREVIEW_INNER_STROKE_IMAGE_PX,
            outerOpacity: BRUSH_PREVIEW_OUTER_OPACITY,
            innerOpacity: BRUSH_PREVIEW_INNER_OPACITY
          }
        : undefined,
      props.store.selectedShapeId[0]()
    )
  }

  const resetBrushSession = (): void => {
    isDrawing = false
    strokeSegments = []
    lastPoint = null
    sessionUndoPushed = false
    brushEngine?.clearSession()
    brushEngine?.clearActiveStroke()
    requestOverlayRender()
  }

  const addStrokeSegment = (from: Point2D, to: Point2D): void => {
    const segment = { from, to }
    strokeSegments.push(segment)
    brushEngine?.stampCapsule(from, to, lockedBrushRadiusImagePx, 'active')
  }

  const commitSessionMask = (): void => {
    const engine = brushEngine
    const labelId = props.activeLabelId()
    const size = props.imageSize()
    if (!engine || !labelId || !size || !engine.hasSessionContent()) return

    const full = engine.readSessionMask()
    if (!full) return

    const bounds = computeMaskBounds(full, size.width, size.height)
    if (!bounds) return

    const cropped = cropMaskBitmap(full, size.width, bounds)
    const shape = props.store.createMask(labelId, bounds, cropped)
    props.store.setShapes([...props.store.shapes[0](), shape])
    props.store.setSelectedShapeId(shape.id)
    engine.clearSession()
    sessionUndoPushed = false
    requestOverlayRender()
  }

  createEffect(() => {
    props.store.shapes[0]()
    props.store.selectedShapeId[0]()
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
    props.brushSize()
    setHoverPoint(null)
    requestOverlayRender()
  })

  const stopInteraction = (): void => {
    dragMode = 'none'
    moveShapeId = null
    setDraftRect(null)
    setInteracting(false)
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }

  const stopBrushDrawing = (event: PointerEvent): void => {
    if (!isDrawing) return

    isDrawing = false
    if (overlayRef?.hasPointerCapture(event.pointerId)) {
      overlayRef.releasePointerCapture(event.pointerId)
    }

    if (strokeSegments.length > 0) {
      brushEngine?.stampCapsules(strokeSegments, lockedBrushRadiusImagePx, 'session')
    }
    brushEngine?.clearActiveStroke()
    strokeSegments = []
    lastPoint = null
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
    if (event.button !== 0) return

    if (props.activeTool() === 'mask') {
      event.preventDefault()
      const point = getImagePoint(event)
      const labelId = props.activeLabelId()
      if (!point || !labelId || !ensureBrushEngine()) return

      if (!sessionUndoPushed) {
        props.store.pushUndo()
        sessionUndoPushed = true
      }

      overlayRef?.setPointerCapture(event.pointerId)
      isDrawing = true
      setHoverPoint(point)
      strokeSegments = []
      lockedBrushRadiusImagePx = brushRadiusImagePx()
      brushEngine?.clearActiveStroke()
      addStrokeSegment(point, point)
      lastPoint = point
      setInteracting(true)
      requestOverlayRender()
      return
    }

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
        setInteracting(true)
        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
      }
      return
    }

    if (tool === 'rectangle') {
      if (!props.activeLabelId()) return
      dragMode = 'draw-rect'
      dragStart = point
      setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 })
      setInteracting(true)
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
  }

  const handleOverlayPointerMove = (event: PointerEvent): void => {
    if (props.activeTool() !== 'mask') return

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
    setInteracting(false)
  }

  const handleOverlayPointerLeave = (event: PointerEvent): void => {
    if (props.activeTool() !== 'mask') return
    if (isDrawing) {
      stopBrushDrawing(event)
      setInteracting(false)
      return
    }
    setHoverPoint(null)
    requestOverlayRender()
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (props.activeTool() === 'mask') {
      if (event.code === 'Space') {
        event.preventDefault()
        commitSessionMask()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        resetBrushSession()
        return
      }
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      props.store.deleteSelected()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) props.store.redo()
      else props.store.undo()
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
          class="annotation-overlay"
          classList={{ 'annotation-overlay--interacting': interacting() }}
          style={{
            width: `${size().width}px`,
            height: `${size().height}px`,
            ...layerStyle()
          }}
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
          onPointerLeave={handleOverlayPointerLeave}
        >
          <canvas ref={glCanvasRef} class="annotation-overlay__gl-canvas" />
          <svg
            class="annotation-overlay__svg"
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
          </svg>
        </div>
      )}
    </Show>
  )
}

export default AnnotationOverlay
