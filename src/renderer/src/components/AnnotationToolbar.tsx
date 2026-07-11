import type { IconTypes } from 'solid-icons'
import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import type { SegmentationMode } from '../../../shared/segmentation'
import { useProjectContext } from '../lib/project-context'
import {
  BrushToolIcon,
  CursorToolIcon,
  DeleteToolIcon,
  RectangleToolIcon
} from '../lib/annotation-tool-icons'

export type AnnotationTool = 'cursor' | 'rectangle' | 'mask'

const ICON_SIZE = 22
const TOOL_BUTTON_CLASS =
  'relative inline-flex h-10 min-h-10 w-full shrink-0 cursor-pointer items-center justify-center border-0 px-0 text-base-content'

const TOOLS: { id: AnnotationTool; label: string; icon: IconTypes }[] = [
  { id: 'cursor', label: 'Cursor', icon: CursorToolIcon },
  { id: 'rectangle', label: 'Rectangle', icon: RectangleToolIcon },
  { id: 'mask', label: 'Mask', icon: BrushToolIcon }
]

const AnnotationToolbar: Component<{
  activeTool: () => AnnotationTool
  segmentationMode: () => SegmentationMode
  onToolChange: (tool: AnnotationTool) => void
}> = (props) => {
  const project = useProjectContext()
  const hasSelection = (): boolean => project.annotationStore.selectedShapeId[0]() !== null

  return (
    <aside
      class="relative z-10 flex w-[var(--toolbar-width)] min-w-[var(--toolbar-width)] shrink-0 flex-col border-base-300 bg-base-200 border-l"
      aria-label="Annotation tools"
    >
      <div class="flex flex-col">
        <For each={TOOLS}>
          {(tool) => {
            const isActive = (): boolean => props.activeTool() === tool.id
            return (
              <Show when={tool.id !== 'rectangle' || props.segmentationMode() === 'instance'}>
                <button
                  type="button"
                  class={TOOL_BUTTON_CLASS}
                  classList={{
                    'bg-primary/15': isActive(),
                    'bg-transparent hover:bg-base-content/8': !isActive()
                  }}
                  title={tool.label}
                  aria-label={tool.label}
                  aria-pressed={isActive()}
                  onClick={(event) => {
                    props.onToolChange(tool.id)
                    event.currentTarget.blur()
                  }}
                >
                  <tool.icon size={ICON_SIZE} aria-hidden="true" />
                  <Show when={isActive()}>
                    <span
                      class="pointer-events-none absolute inset-y-0 right-0 w-[3px] bg-primary"
                      aria-hidden="true"
                    />
                  </Show>
                </button>
              </Show>
            )
          }}
        </For>
      </div>
      <div class="mt-auto border-t border-base-content/10">
        <button
          type="button"
          class={TOOL_BUTTON_CLASS}
          classList={{
            'bg-transparent text-error hover:bg-error/10': hasSelection(),
            'bg-transparent text-base-content/20': !hasSelection()
          }}
          title="Delete selected"
          aria-label="Delete selected"
          disabled={!hasSelection()}
          onClick={(event) => {
            project.annotationStore.deleteSelected()
            event.currentTarget.blur()
          }}
        >
          <DeleteToolIcon size={ICON_SIZE} aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}

export default AnnotationToolbar
