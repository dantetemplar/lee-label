import type { Label, PolygonShape, RectangleShape } from '../../../shared/annotations'
import {
  HOVERED_SHAPE_OPACITY,
  SELECTED_SHAPE_OPACITY,
  SHAPE_OPACITY
} from '../../../shared/annotations'
import { hexToRgba } from '../../../shared/label-color'
import type { Component } from 'solid-js'
import { For, Show, createMemo } from 'solid-js'
import type { AnnotationStore } from '../lib/annotation-store'
import {
  rectangleCornerPoints,
  rectanglesIntersect,
  type RectCorner
} from '../lib/annotation-coords'

function polygonPointsToSvg(points: { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function shapeFillOpacity(selected: boolean, hovered: boolean): number {
  if (selected) return SELECTED_SHAPE_OPACITY
  if (hovered) return HOVERED_SHAPE_OPACITY
  return SHAPE_OPACITY
}

const CORNER_KEYS: RectCorner[] = ['nw', 'ne', 'sw', 'se']
const CORNER_SCREEN_RADIUS = 4
const ERASER_MARK_COLOR = '#ef4444'

const AnnotationShapeLayer: Component<{
  width: number
  height: number
  scale: number
  store: AnnotationStore
  labels: () => Label[]
  activeLabelId: () => string | null
  hiddenShapeId: () => string | null
  draftMarquee: () => { x: number; y: number; width: number; height: number } | null
  draftRect: () => { x: number; y: number; width: number; height: number } | null
  draftRectMode: () => 'draw' | 'erase'
  brushSvgPreview: () => { pixels: Array<{ x: number; y: number }>; opacity: number } | null
}> = (props) => {
  const labelMap = createMemo(() => new Map(props.labels().map((label) => [label.id, label])))
  const activeLabelColor = createMemo(() => {
    const labelId = props.activeLabelId()
    if (!labelId) return '#ffffff'
    return labelMap().get(labelId)?.color ?? '#ffffff'
  })
  const rectangles = createMemo(() =>
    props.store.shapes[0]().filter((shape): shape is RectangleShape => shape.type === 'rectangle')
  )
  const polygons = createMemo(() =>
    props.store
      .shapes[0]()
      .filter(
        (shape): shape is PolygonShape =>
          shape.type === 'polygon' && shape.id !== props.hiddenShapeId()
      )
  )
  const eraserMarkedIds = createMemo(() => {
    const draft = props.draftRect()
    if (!draft || props.draftRectMode() !== 'erase') return new Set<string>()
    if (draft.width <= 0 || draft.height <= 0) return new Set<string>()
    const marked = new Set<string>()
    for (const rect of rectangles()) {
      if (rectanglesIntersect(draft, rect)) marked.add(rect.id)
    }
    return marked
  })
  const cornerRadius = (): number => Math.max(2 / props.scale, CORNER_SCREEN_RADIUS / props.scale)
  const cornerStroke = (): number => 1.25 / props.scale

  return (
    <svg
      class="pointer-events-none absolute top-0 left-0 z-2 h-full w-full overflow-visible"
      width={props.width}
      height={props.height}
      viewBox={`0 0 ${props.width} ${props.height}`}
    >
      <For each={rectangles()}>
        {(rect) => {
          const label = (): Label | undefined => labelMap().get(rect.labelId)
          const selected = (): boolean => props.store.isSelected(rect.id)
          const hovered = (): boolean => props.store.hoveredShapeId[0]() === rect.id
          const soleSelected = (): boolean =>
            selected() && props.store.selectedShapeIds[0]().length === 1
          const marked = (): boolean => eraserMarkedIds().has(rect.id)
          const color = (): string => (marked() ? ERASER_MARK_COLOR : (label()?.color ?? '#ffffff'))
          const corners = (): Record<RectCorner, { x: number; y: number }> =>
            rectangleCornerPoints(rect)
          return (
            <g>
              <rect
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                fill={hexToRgba(
                  color(),
                  marked() ? SELECTED_SHAPE_OPACITY : shapeFillOpacity(selected(), hovered())
                )}
                stroke={color()}
                stroke-width={selected() || marked() ? 2.5 : 1.5}
              />
              <Show when={soleSelected()}>
                <For each={CORNER_KEYS}>
                  {(key) => (
                    <circle
                      cx={corners()[key].x}
                      cy={corners()[key].y}
                      r={cornerRadius()}
                      fill="#ffffff"
                      stroke={color()}
                      stroke-width={cornerStroke()}
                    />
                  )}
                </For>
              </Show>
            </g>
          )
        }}
      </For>
      <For each={polygons()}>
        {(polygon) => {
          const label = (): Label | undefined => labelMap().get(polygon.labelId)
          const selected = (): boolean => props.store.isSelected(polygon.id)
          const hovered = (): boolean => props.store.hoveredShapeId[0]() === polygon.id
          return (
            <polygon
              points={polygonPointsToSvg(polygon.points)}
              fill={hexToRgba(
                label()?.color ?? '#ffffff',
                shapeFillOpacity(selected(), hovered())
              )}
              stroke={label()?.color ?? '#ffffff'}
              stroke-width={selected() ? 2.5 : 1.5}
            />
          )
        }}
      </For>
      <Show when={props.draftMarquee()}>
        {(rect) => (
          <rect
            x={rect().x}
            y={rect().y}
            width={rect().width}
            height={rect().height}
            fill="rgba(255,255,255,0.08)"
            stroke="#ffffff"
            stroke-width={1.5 / props.scale}
            stroke-dasharray={`${4 / props.scale} ${3 / props.scale}`}
          />
        )}
      </Show>
      <Show when={props.draftRect()}>
        {(rect) => {
          const corners = (): Record<RectCorner, { x: number; y: number }> =>
            rectangleCornerPoints(rect())
          const isErase = (): boolean => props.draftRectMode() === 'erase'
          const color = (): string => (isErase() ? '#ffffff' : activeLabelColor())
          return (
            <g>
              <rect
                x={rect().x}
                y={rect().y}
                width={rect().width}
                height={rect().height}
                fill={hexToRgba(color(), isErase() ? 0.35 : SHAPE_OPACITY)}
                stroke={color()}
                stroke-width={1.5}
                stroke-dasharray={isErase() ? '5 4' : '4 3'}
              />
              <For each={CORNER_KEYS}>
                {(key) => (
                  <circle
                    cx={corners()[key].x}
                    cy={corners()[key].y}
                    r={cornerRadius()}
                    fill="#ffffff"
                    stroke={color()}
                    stroke-width={cornerStroke()}
                  />
                )}
              </For>
            </g>
          )
        }}
      </Show>
      <Show when={props.brushSvgPreview()}>
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
  )
}

export default AnnotationShapeLayer
