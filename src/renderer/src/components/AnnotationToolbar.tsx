import type { Component } from 'solid-js'
import { For } from 'solid-js'
import type { IconTypes } from 'solid-icons'
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
  onToolChange: (tool: AnnotationTool) => void
}> = (props) => (
  <aside class="annotation-toolbar border-base-300 bg-base-200 border-l" aria-label="Annotation tools">
    <div class="annotation-toolbar-tools">
      <For each={TOOLS}>
        {(tool) => (
          <button
            type="button"
            class="annotation-toolbar-btn text-base-content"
            classList={{
              'annotation-toolbar-btn--selected': props.activeTool() === tool.id
            }}
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={props.activeTool() === tool.id}
            onClick={() => props.onToolChange(tool.id)}
          >
            <tool.icon size={ICON_SIZE} aria-hidden="true" />
          </button>
        )}
      </For>
    </div>
  </aside>
)

export default AnnotationToolbar
