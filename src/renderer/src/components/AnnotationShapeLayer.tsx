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

function polygonPointsToSvg(points: { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function shapeFillOpacity(selected: boolean, hovered: boolean): number {
  if (selected) return SELECTED_SHAPE_OPACITY
  if (hovered) return HOVERED_SHAPE_OPACITY
  return SHAPE_OPACITY
}

const AnnotationShapeLayer: Component<{
  width: number
  height: number
  store: AnnotationStore
  labels: () => Label[]
  activeLabelId: () => string | null
  hiddenShapeId: () => string | null
  hoveredShapeId: () => string | null
  draftRect: () => { x: number; y: number; width: number; height: number } | null
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
          const selected = (): boolean => props.store.selectedShapeId[0]() === rect.id
          const hovered = (): boolean => props.hoveredShapeId() === rect.id
          return (
            <rect
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
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
      <For each={polygons()}>
        {(polygon) => {
          const label = (): Label | undefined => labelMap().get(polygon.labelId)
          const selected = (): boolean => props.store.selectedShapeId[0]() === polygon.id
          const hovered = (): boolean => props.hoveredShapeId() === polygon.id
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
      <Show when={props.draftRect()}>
        {(rect) => (
          <rect
            x={rect().x}
            y={rect().y}
            width={rect().width}
            height={rect().height}
            fill={hexToRgba(activeLabelColor(), SHAPE_OPACITY)}
            stroke={activeLabelColor()}
            stroke-width={1.5}
            stroke-dasharray="4 3"
          />
        )}
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
