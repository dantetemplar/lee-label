import type { Component } from 'solid-js'
import { For, Show, createEffect, createMemo, createSignal } from 'solid-js'
import { BsArrowsFullscreen, BsChevronDown, BsTrash } from 'solid-icons/bs'
import type { Label } from '../../../shared/annotations'
import { shapeBounds } from '../lib/annotation-coords'
import type { WorkingShape } from '../lib/annotation-store'
import { useProjectContext } from '../lib/project-context'
import FloatingPopover from './FloatingPopover'

const SHAPE_TYPE_LABEL: Record<WorkingShape['type'], string> = {
  rectangle: 'Rect',
  mask: 'Mask',
  polygon: 'Poly'
}

type LabelMenuSession = {
  shapeId: string
  trigger: HTMLElement
  rect: DOMRect
  bulk: boolean
}

const ObjectList: Component<{ embedded?: boolean }> = (props) => {
  const project = useProjectContext()
  const store = project.annotationStore
  const [labelMenu, setLabelMenu] = createSignal<LabelMenuSession | null>(null)

  const labelMap = createMemo(() => new Map(project.labels().map((label) => [label.id, label])))

  /** Global 1-based number by creation order (zOrder asc). */
  const numberedShapes = createMemo(() => {
    const byCreation = [...store.shapes[0]()].sort((left, right) => left.zOrder - right.zOrder)
    return byCreation.map((shape, index) => ({ shape, number: index + 1 }))
  })

  const sortedShapes = createMemo(() =>
    [...numberedShapes()].sort((left, right) => left.number - right.number)
  )

  const selectedCount = createMemo(() => store.selectedShapeIds[0]().length)
  const [rangeAnchorId, setRangeAnchorId] = createSignal<string | null>(null)

  const closeLabelMenu = (): void => {
    setLabelMenu(null)
  }

  const openLabelMenu = (
    event: MouseEvent,
    shapeId: string,
    trigger: HTMLElement,
    bulk = false
  ): void => {
    event.stopPropagation()
    const current = labelMenu()
    if (current?.shapeId === shapeId && current.bulk === bulk) {
      closeLabelMenu()
      return
    }
    const rect = trigger.getBoundingClientRect()
    setLabelMenu({ shapeId, trigger, rect, bulk })
  }

  const handleRowClick = (event: MouseEvent, shapeId: string): void => {
    if (event.shiftKey) {
      event.preventDefault()
      window.getSelection()?.removeAllRanges()
      const ordered = sortedShapes().map((item) => item.shape.id)
      const anchor = rangeAnchorId() ?? store.primarySelectedId() ?? shapeId
      const fromIndex = ordered.indexOf(anchor)
      const toIndex = ordered.indexOf(shapeId)
      if (fromIndex < 0 || toIndex < 0) {
        store.selectOnly(shapeId)
        setRangeAnchorId(shapeId)
      } else {
        const start = Math.min(fromIndex, toIndex)
        const end = Math.max(fromIndex, toIndex)
        const range = ordered.slice(start, end + 1)
        store.setSelectedShapeIds([...range.filter((id) => id !== shapeId), shapeId])
      }
      const shape = store.shapes[0]().find((item) => item.id === shapeId)
      if (shape) project.setActiveLabelId(shape.labelId)
      return
    }

    if (event.ctrlKey || event.metaKey) {
      store.toggleSelect(shapeId)
      return
    }

    store.selectOnly(shapeId)
    setRangeAnchorId(shapeId)
    const shape = store.shapes[0]().find((item) => item.id === shapeId)
    if (shape) project.setActiveLabelId(shape.labelId)
  }

  const resolveDeleteIds = (shapeId: string): string[] => {
    const selected = store.selectedShapeIds[0]()
    if (selected.length > 1 && selected.includes(shapeId)) return selected
    return [shapeId]
  }

  const handleDelete = (shapeId: string): void => {
    project.requestDeleteShapes(resolveDeleteIds(shapeId))
  }

  const applyLabel = (labelId: string): void => {
    const session = labelMenu()
    if (!session) return
    if (session.bulk) {
      store.setLabelForSelected(labelId)
    } else {
      const selected = store.selectedShapeIds[0]()
      if (selected.length > 1 && selected.includes(session.shapeId)) {
        store.setLabelForSelected(labelId)
      } else {
        store.setShapeLabel(session.shapeId, labelId)
      }
    }
    closeLabelMenu()
  }

  const handleFocus = (shape: WorkingShape): void => {
    project.focusShapeBounds(shapeBounds(shape))
    store.selectOnly(shape.id)
    project.setActiveLabelId(shape.labelId)
  }

  const currentMenuLabelId = createMemo(() => {
    const session = labelMenu()
    if (!session) return null
    if (session.bulk) return null
    return store.shapes[0]().find((shape) => shape.id === session.shapeId)?.labelId ?? null
  })

  createEffect(() => {
    const primary = store.primarySelectedId()
    if (!primary) return
    const row = document.querySelector<HTMLElement>(
      `[data-object-item][data-shape-id="${primary}"]`
    )
    row?.scrollIntoView({ block: 'nearest' })
  })

  return (
    <div
      class="flex min-h-0 flex-1 flex-col"
      classList={{
        'w-[var(--sidebar-width)] min-w-[var(--sidebar-width)] border-base-300 bg-base-200 border-r':
          !props.embedded
      }}
    >
      <section class="flex min-h-0 flex-1 flex-col">
        <div class="flex items-center justify-between gap-2 px-3 pt-2.5 pb-2">
          <div class="min-w-0 truncate text-[11px] font-semibold tracking-wide text-base-content/60">
            OBJECTS
          </div>
          <span class="shrink-0 text-[10px] text-base-content/45">{sortedShapes().length}</span>
        </div>

        <Show when={selectedCount() > 1}>
          <div class="mb-1 flex h-5 items-center gap-0 px-2">
            <span class="shrink-0 px-1 text-[10px] text-base-content/45">
              {selectedCount()} sel.
            </span>
            <button
              type="button"
              class="btn btn-ghost btn-xs h-5 min-h-0! min-w-0 flex-1 justify-start px-1 py-0! text-[10px] font-normal leading-none text-base-content/55"
              onClick={(event) => openLabelMenu(event, '__bulk__', event.currentTarget, true)}
            >
              Change label…
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-xs btn-square h-5 min-h-0! w-5 shrink-0 p-0! text-error/55 hover:text-error"
              title="Delete selected"
              aria-label="Delete selected"
              onClick={() => project.requestDeleteShapes()}
            >
              <BsTrash size={12} aria-hidden="true" />
            </button>
          </div>
        </Show>

        <div class="object-list-scrollbar flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
          <Show
            when={sortedShapes().length > 0}
            fallback={
              <div class="px-1 py-4 text-xs text-base-content/45">No objects on this image</div>
            }
          >
            <For each={sortedShapes()}>
              {(item) => {
                const shape = (): WorkingShape => item.shape
                const number = (): number => item.number
                const label = (): Label | undefined => labelMap().get(shape().labelId)
                const selected = (): boolean => store.isSelected(shape().id)
                const hovered = (): boolean => store.hoveredShapeId[0]() === shape().id
                return (
                  <div
                    data-object-item
                    data-shape-id={shape().id}
                    aria-selected={selected()}
                    class="group relative flex h-5 cursor-pointer items-center gap-0 rounded select-none"
                    classList={{
                      'bg-primary/15': selected(),
                      'bg-base-content/6': hovered() && !selected()
                    }}
                    onMouseEnter={() => store.setHoveredShapeId(shape().id)}
                    onMouseLeave={() => {
                      if (store.hoveredShapeId[0]() === shape().id) {
                        store.setHoveredShapeId(null)
                      }
                    }}
                    onClick={(event) => handleRowClick(event, shape().id)}
                    onMouseDown={(event) => {
                      if (event.shiftKey) event.preventDefault()
                    }}
                  >
                    <span
                      class="w-7 shrink-0 text-center text-[10px] tabular-nums leading-none text-base-content/40"
                      title={`Object #${number()}`}
                    >
                      {number()}
                    </span>
                    <span
                      class="flex h-5 w-5 shrink-0 items-center justify-center"
                      aria-hidden="true"
                    >
                      <span
                        class="h-2.5 w-2.5 rounded-sm shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-base-content)_18%,transparent)]"
                        style={{ background: label()?.color ?? '#888' }}
                      />
                    </span>
                    <span class="max-w-[7rem] min-w-0 shrink truncate px-1 text-xs leading-none">
                      {label()?.name ?? '—'}
                    </span>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs btn-square h-5 min-h-0! w-4 shrink-0 p-0! text-base-content/40 opacity-0 transition-opacity group-hover:opacity-100 hover:text-base-content"
                      classList={{
                        'opacity-100 text-base-content':
                          labelMenu()?.shapeId === shape().id && !labelMenu()?.bulk
                      }}
                      title="Change label"
                      aria-label={`Change label for object ${number()}`}
                      aria-expanded={labelMenu()?.shapeId === shape().id && !labelMenu()?.bulk}
                      onClick={(event) => {
                        openLabelMenu(event, shape().id, event.currentTarget)
                      }}
                    >
                      <BsChevronDown size={10} aria-hidden="true" />
                    </button>
                    <span class="min-w-0 flex-1" aria-hidden="true" />
                    <span class="pointer-events-none w-7 shrink-0 text-center text-[10px] leading-none text-base-content/40 opacity-0 transition-opacity group-hover:opacity-100">
                      {SHAPE_TYPE_LABEL[shape().type]}
                    </span>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs btn-square h-5 min-h-0! w-5 shrink-0 p-0! text-base-content/45 opacity-0 transition-opacity group-hover:opacity-100 hover:text-base-content"
                      title="Focus object"
                      aria-label="Focus object"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleFocus(shape())
                      }}
                    >
                      <BsArrowsFullscreen size={12} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs btn-square h-5 min-h-0! w-5 shrink-0 p-0! text-error/55 opacity-0 transition-opacity group-hover:opacity-100 hover:text-error"
                      title="Delete object"
                      aria-label="Delete object"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDelete(shape().id)
                      }}
                    >
                      <BsTrash size={12} aria-hidden="true" />
                    </button>
                  </div>
                )
              }}
            </For>
          </Show>
        </div>
      </section>

      <FloatingPopover
        open={() => labelMenu() !== null}
        onClose={closeLabelMenu}
        reference={() => labelMenu()?.trigger}
        placement="bottom-start"
        contentRole="listbox"
        panelClass="bg-base-100 border-base-300 min-w-40 rounded-box border p-1 shadow-md"
        fitContent={false}
      >
        <For each={project.labels()}>
          {(item) => {
            const active = (): boolean => currentMenuLabelId() === item.id
            return (
              <button
                type="button"
                role="option"
                aria-selected={active()}
                class="flex h-7 w-full items-center gap-2 rounded-btn px-2 text-left text-xs hover:bg-base-content/8"
                classList={{ 'bg-primary/15': active() }}
                onClick={() => applyLabel(item.id)}
              >
                <span
                  class="h-2.5 w-2.5 shrink-0 rounded-sm shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-base-content)_18%,transparent)]"
                  style={{ background: item.color }}
                  aria-hidden="true"
                />
                <span class="truncate">{item.name}</span>
              </button>
            )
          }}
        </For>
      </FloatingPopover>
    </div>
  )
}

export default ObjectList
