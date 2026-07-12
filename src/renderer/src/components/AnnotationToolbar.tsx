import type { IconTypes } from 'solid-icons'
import { BsArrowClockwise, BsArrowCounterclockwise } from 'solid-icons/bs'
import type { Component, JSX } from 'solid-js'
import { For, Show } from 'solid-js'
import type { SegmentationMode } from '../../../shared/segmentation'
import { getActiveStore } from '../lib/annotation-backend'
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
  'relative inline-flex h-14 min-h-14 w-full shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 border-0 px-0 text-base-content'

const TOOLS: { id: AnnotationTool; label: string; icon: IconTypes; hint: string }[] = [
  { id: 'cursor', label: 'Cursor', icon: CursorToolIcon, hint: 'Esc' },
  { id: 'rectangle', label: 'Rectangle', icon: RectangleToolIcon, hint: '1' },
  { id: 'mask', label: 'Mask', icon: BrushToolIcon, hint: '2' }
]

const ToolKeyHint: Component<{ available: boolean; children: JSX.Element }> = (props) => (
  <kbd
    class="kbd kbd-xs pointer-events-none h-3.5 min-h-0 px-1 text-[9px] leading-none"
    classList={{
      'opacity-60': props.available,
      'opacity-25': !props.available
    }}
    aria-disabled={!props.available}
  >
    {props.children}
  </kbd>
)

const AnnotationToolbar: Component<{
  activeTool: () => AnnotationTool
  segmentationMode: () => SegmentationMode
  onToolChange: (tool: AnnotationTool) => void
}> = (props) => {
  const project = useProjectContext()
  const activeStore = () =>
    getActiveStore(props.segmentationMode(), project.annotationStore, project.semanticStore)
  const hasSelection = (): boolean => project.annotationStore.selectedShapeId[0]() !== null
  const canUndo = (): boolean => activeStore().canUndo[0]()
  const canRedo = (): boolean => activeStore().canRedo[0]()
  const isCursor = (): boolean => props.activeTool() === 'cursor'

  const isHintAvailable = (toolId: AnnotationTool): boolean => {
    if (toolId === 'cursor') return !isCursor() || hasSelection()
    if (toolId === 'rectangle' || toolId === 'mask') return isCursor()
    return false
  }

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
                  title={`${tool.label} (${tool.hint})`}
                  aria-label={tool.label}
                  aria-keyshortcuts={tool.hint === 'Esc' ? 'Escape' : tool.hint}
                  aria-pressed={isActive()}
                  onClick={(event) => {
                    props.onToolChange(tool.id)
                    event.currentTarget.blur()
                  }}
                >
                  <tool.icon size={ICON_SIZE} aria-hidden="true" />
                  <ToolKeyHint available={isHintAvailable(tool.id)}>{tool.hint}</ToolKeyHint>
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
            'bg-transparent hover:bg-base-content/8': canUndo(),
            'bg-transparent text-base-content/20': !canUndo()
          }}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          aria-keyshortcuts="Control+Z Meta+Z"
          disabled={!canUndo()}
          onClick={(event) => {
            activeStore().undo()
            event.currentTarget.blur()
          }}
        >
          <BsArrowCounterclockwise size={ICON_SIZE} aria-hidden="true" />
          <ToolKeyHint available={canUndo()}>⌃Z</ToolKeyHint>
        </button>
        <button
          type="button"
          class={TOOL_BUTTON_CLASS}
          classList={{
            'bg-transparent hover:bg-base-content/8': canRedo(),
            'bg-transparent text-base-content/20': !canRedo()
          }}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
          aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
          disabled={!canRedo()}
          onClick={(event) => {
            activeStore().redo()
            event.currentTarget.blur()
          }}
        >
          <BsArrowClockwise size={ICON_SIZE} aria-hidden="true" />
          <ToolKeyHint available={canRedo()}>⌃⇧Z</ToolKeyHint>
        </button>
        <button
          type="button"
          class={TOOL_BUTTON_CLASS}
          classList={{
            'bg-transparent text-error hover:bg-error/10': hasSelection(),
            'bg-transparent text-base-content/20': !hasSelection()
          }}
          title="Delete selected (Del)"
          aria-label="Delete selected"
          aria-keyshortcuts="Delete"
          disabled={!hasSelection()}
          onClick={(event) => {
            project.annotationStore.deleteSelected()
            event.currentTarget.blur()
          }}
        >
          <DeleteToolIcon size={ICON_SIZE} aria-hidden="true" />
          <ToolKeyHint available={hasSelection()}>Del</ToolKeyHint>
        </button>
      </div>
    </aside>
  )
}

export default AnnotationToolbar
