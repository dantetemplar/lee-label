import type { Component, JSX } from 'solid-js'
import { For } from 'solid-js'

export type AnnotationTool = 'cursor' | 'rectangle' | 'mask'

const ICON_SIZE = 22

const CursorIcon = (): JSX.Element => (
  <svg
    width={ICON_SIZE}
    height={ICON_SIZE}
    viewBox="0 0 40 40"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M30.72 25.142h-7.625l4.013 9.562c.28.663-.04 1.406-.679 1.687l-3.534 1.507a1.281 1.281 0 01-1.677-.683l-3.813-9.08-6.229 6.267c-.83.835-2.176.192-2.176-.904V3.287c0-1.153 1.432-1.716 2.176-.904l20.442 20.569c.825.786.216 2.19-.898 2.19z" />
  </svg>
)

const RectangleIcon = (): JSX.Element => (
  <svg
    width={ICON_SIZE}
    height={ICON_SIZE}
    viewBox="0 0 40 40"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    aria-hidden="true"
  >
    <path d="M3 8h34v25H3z" />
  </svg>
)

const MaskIcon = (): JSX.Element => (
  <svg
    width={ICON_SIZE}
    height={ICON_SIZE}
    viewBox="0 0 24 25"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M17.248 4.153l-4.568 8.762c-.668.15-1.313.418-1.83.935l-.018.016-.017.02c-.74.843-.988 1.938-1.389 3.092-.372 1.07-.874 2.197-1.736 3.275H2.25v1.5h6.586v-.054c4.045-.138 6.079-1.253 7.32-2.55.912-.913 1.184-2.179.953-3.363L22.48 5.6l-1.327-.7-3.091 5.863L16.08 9.64l2.498-4.793-1.33-.694zm-1.862 6.818l1.976 1.12-1.052 1.995c-.063-.074-.087-.166-.156-.236-.506-.505-1.135-.77-1.786-.926l1.018-1.953zm-1.884 3.276c.574 0 1.148.221 1.59.664a2.239 2.239 0 010 3.182l-.005.006-.006.006c-.962 1.007-2.35 1.845-5.54 2.057.571-.94 1.016-1.87 1.302-2.692.416-1.197.72-2.134 1.09-2.568a2.244 2.244 0 011.569-.655z" />
  </svg>
)

const TOOLS: { id: AnnotationTool; label: string; icon: () => JSX.Element }[] = [
  { id: 'cursor', label: 'Cursor', icon: CursorIcon },
  { id: 'rectangle', label: 'Rectangle', icon: RectangleIcon },
  { id: 'mask', label: 'Mask', icon: MaskIcon }
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
            <tool.icon />
          </button>
        )}
      </For>
    </div>
  </aside>
)

export default AnnotationToolbar
