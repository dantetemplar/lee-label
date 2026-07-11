import type { IconTypes } from 'solid-icons'
import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import type { SegmentationMode } from '../../../shared/segmentation'
import {
    BrushToolIcon,
    CursorToolIcon,
    RectangleToolIcon
} from '../lib/annotation-tool-icons'

export type AnnotationTool = 'cursor' | 'rectangle' | 'mask'

const ICON_SIZE = 22

const TOOLS: { id: AnnotationTool; label: string; icon: IconTypes }[] = [
  { id: 'cursor', label: 'Cursor', icon: CursorToolIcon },
  { id: 'rectangle', label: 'Rectangle', icon: RectangleToolIcon },
  { id: 'mask', label: 'Mask', icon: BrushToolIcon }
]

const AnnotationToolbar: Component<{
  activeTool: () => AnnotationTool
  segmentationMode: () => SegmentationMode
  onToolChange: (tool: AnnotationTool) => void
}> = (props) => (
  <aside
    class="relative z-10 flex w-[var(--toolbar-width)] min-w-[var(--toolbar-width)] shrink-0 flex-col border-base-300 bg-base-200 border-l"
    aria-label="Annotation tools"
  >
    <div class="flex flex-col py-1.5">
      <For each={TOOLS}>
        {(tool) => (
          <Show when={tool.id !== 'rectangle' || props.segmentationMode() === 'instance'}>
            <button
              type="button"
              class="btn btn-square btn-ghost h-10 w-full rounded-none"
              classList={{
                'btn-active bg-primary/15 shadow-[inset_-3px_0_0_var(--color-primary)]':
                  props.activeTool() === tool.id
              }}
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={props.activeTool() === tool.id}
              onClick={() => props.onToolChange(tool.id)}
            >
              <tool.icon size={ICON_SIZE} aria-hidden="true" />
            </button>
          </Show>
        )}
      </For>
    </div>
  </aside>
)

export default AnnotationToolbar
