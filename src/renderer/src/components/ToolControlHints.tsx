import type { Component } from 'solid-js'
import { For, Show, createMemo } from 'solid-js'
import { useProjectContext } from '../lib/project-context'
import { getToolControlHints } from '../lib/tool-control-hints'
import ControlHintChip from './ControlHintChip'

const ToolControlHints: Component<{
  isImage: () => boolean
}> = (props) => {
  const project = useProjectContext()

  const hints = createMemo(() =>
    getToolControlHints(
      project.activeTool(),
      project.projectSettings().segmentationMode,
      props.isImage()
    )
  )

  return (
    <Show when={hints().length > 0}>
      <div
        class="statusbar-hints flex h-full min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-3"
        aria-label="Tool controls"
      >
        <For each={hints()}>
          {(hint, index) => (
            <span class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
              <Show when={index() > 0}>
                <span class="pr-1 text-base-content/25" aria-hidden="true">
                  ·
                </span>
              </Show>
              <span>{hint.label}</span>
              <Show
                when={hint.sequential}
                fallback={<ControlHintChip keys={hint.keys} />}
              >
                <span class="inline-flex items-center gap-0.5">
                  <For each={hint.keys}>
                    {(key) => (
                      <Show
                        when={key !== 'or'}
                        fallback={
                          <span class="px-0.5 text-base-content/45">or</span>
                        }
                      >
                        <ControlHintChip keys={[key]} />
                      </Show>
                    )}
                  </For>
                </span>
              </Show>
            </span>
          )}
        </For>
      </div>
    </Show>
  )
}

export default ToolControlHints
