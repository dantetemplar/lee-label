import type { Component } from 'solid-js'
import { For, Match, Switch } from 'solid-js'
import type { ImageStatus, Label } from '../../../shared/annotations'
import type { FileEntry } from '../../../shared/types'
import { useProjectContext, type CursorSidebarTab } from '../lib/project-context'
import FileTree from './FileTree'
import LabelPanel from './LabelPanel'
import ObjectList from './ObjectList'

const TABS: { id: CursorSidebarTab; label: string }[] = [
  { id: 'objects', label: 'Objects' },
  { id: 'labels', label: 'Labels' },
  { id: 'files', label: 'Files' }
]

const CursorSidebar: Component<{
  rootName: () => string
  entries: () => FileEntry[]
  selectedPath: () => string | null
  projectRoot: () => string | null
  imageStatuses: () => Record<string, ImageStatus>
  onSelectFile: (node: FileEntry) => void
  onTreeFocusChange: (path: string) => void
  labels: () => Label[]
  activeLabelId: () => string | null
  onSelectLabel: (id: string) => void
  onCreateLabel: (name: string, color?: string) => Promise<void>
  onUpdateLabel: (label: Label) => Promise<void>
  onDeleteLabel: (id: string) => Promise<void>
  labelError: () => string | null
}> = (props) => {
  const project = useProjectContext()
  const tab = (): CursorSidebarTab => project.cursorSidebarTab()

  return (
    <aside class="flex w-[var(--sidebar-width)] min-w-[var(--sidebar-width)] flex-col border-base-300 bg-base-200 border-r">
      <div
        role="tablist"
        aria-label="Cursor sidebar"
        class="flex shrink-0 gap-0.5 border-base-300 border-b px-2 pt-2 pb-1.5"
      >
        <For each={TABS}>
          {(item) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab() === item.id}
              class="btn btn-ghost btn-xs h-6 min-h-0 flex-1 px-1 text-[11px] font-medium tracking-wide"
              classList={{
                'bg-primary/15 text-base-content': tab() === item.id,
                'text-base-content/50 hover:text-base-content': tab() !== item.id
              }}
              onClick={() => project.setCursorSidebarTab(item.id)}
            >
              {item.label}
            </button>
          )}
        </For>
      </div>

      <div class="flex min-h-0 flex-1 flex-col">
        <Switch>
          <Match when={tab() === 'objects'}>
            <ObjectList embedded />
          </Match>
          <Match when={tab() === 'labels'}>
            <LabelPanel
              labels={props.labels}
              activeLabelId={props.activeLabelId}
              onSelect={props.onSelectLabel}
              onCreate={props.onCreateLabel}
              onUpdate={props.onUpdateLabel}
              onDelete={props.onDeleteLabel}
              showShortcuts={() => false}
              error={props.labelError}
            />
          </Match>
          <Match when={tab() === 'files'}>
            <FileTree
              embedded
              rootName={props.rootName}
              entries={props.entries}
              selectedPath={props.selectedPath}
              projectRoot={props.projectRoot}
              imageStatuses={props.imageStatuses}
              onSelect={props.onSelectFile}
              onFocusChange={props.onTreeFocusChange}
            />
          </Match>
        </Switch>
      </div>
    </aside>
  )
}

export default CursorSidebar
