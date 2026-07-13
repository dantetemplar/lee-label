import type { IconTypes } from 'solid-icons'
import { BsArrowClockwise, BsArrowCounterclockwise } from 'solid-icons/bs'
import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import type { SegmentationMode } from '../../../shared/segmentation'
import { getActiveStore } from '../lib/annotation-backend'
import { hasModifierKey, hasShiftKey } from '../lib/pressed-keys'
import { useProjectContext } from '../lib/project-context'
import {
  isToolShortcutEmphasized,
  isToolShortcutPressed
} from '../lib/tool-shortcut-pressed'
import {
  BrushToolIcon,
  CursorToolIcon,
  DeleteToolIcon,
  RectangleToolIcon
} from '../lib/annotation-tool-icons'
import KeyboardHint from './KeyboardHint'

export type AnnotationTool = 'cursor' | 'rectangle' | 'mask'

const ICON_SIZE = 22
const TOOL_BUTTON_CLASS =
  'relative inline-flex h-14 min-h-14 w-full shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 border-0 px-0 text-base-content'

const TOOLS: { id: AnnotationTool; label: string; icon: IconTypes; hint: string; shortcut: string }[] = [
  { id: 'cursor', label: 'Cursor', icon: CursorToolIcon, hint: '~', shortcut: 'Backquote' },
  { id: 'rectangle', label: 'Rectangle', icon: RectangleToolIcon, hint: '~1', shortcut: 'Backquote 1' },
  { id: 'mask', label: 'Mask', icon: BrushToolIcon, hint: '~2', shortcut: 'Backquote 2' }
]

const AnnotationToolbar: Component<{
  activeTool: () => AnnotationTool
  segmentationMode: () => SegmentationMode
  onToolChange: (tool: AnnotationTool) => void
}> = (props) => {
  const project = useProjectContext()
  const activeStore = () =>
    getActiveStore(props.segmentationMode(), project.annotationStore, project.semanticStore)
  const hasSelection = (): boolean => project.annotationStore.hasSelection()
  const canUndo = (): boolean => activeStore().canUndo[0]()
  const canRedo = (): boolean => activeStore().canRedo[0]()
  const pressedKeys = (): ReadonlySet<string> => project.pressedKeys()

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
                  title={`${tool.label} (${tool.id === 'cursor' ? '~' : tool.hint.replace('~', '~+')})`}
                  aria-label={tool.label}
                  aria-keyshortcuts={tool.shortcut}
                  aria-pressed={isActive()}
                  onClick={(event) => {
                    props.onToolChange(tool.id)
                    event.currentTarget.blur()
                  }}
                >
                  <tool.icon size={ICON_SIZE} aria-hidden="true" />
                  <KeyboardHint
                    pressed={() =>
                      isToolShortcutPressed(
                        tool.id,
                        pressedKeys(),
                        props.segmentationMode() === 'instance'
                      )
                    }
                    emphasized={() => isToolShortcutEmphasized(tool.id, pressedKeys())}
                  >
                    {tool.hint}
                  </KeyboardHint>
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
          <KeyboardHint
            disabled={() => !canUndo()}
            pressed={() => {
              const keys = pressedKeys()
              return hasModifierKey(keys) && keys.has('KeyZ') && !hasShiftKey(keys)
            }}
          >
            ⌃Z
          </KeyboardHint>
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
          <KeyboardHint
            disabled={() => !canRedo()}
            pressed={() => {
              const keys = pressedKeys()
              return hasModifierKey(keys) && keys.has('KeyZ') && hasShiftKey(keys)
            }}
          >
            ⌃⇧Z
          </KeyboardHint>
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
            project.requestDeleteShapes()
            event.currentTarget.blur()
          }}
        >
          <DeleteToolIcon size={ICON_SIZE} aria-hidden="true" />
          <KeyboardHint
            disabled={() => !hasSelection()}
            pressed={() => {
              const keys = pressedKeys()
              return keys.has('Delete') || keys.has('Backspace')
            }}
          >
            Del
          </KeyboardHint>
        </button>
      </div>
    </aside>
  )
}

export default AnnotationToolbar
