import type { Component } from 'solid-js'
import { Index, Show, createSignal } from 'solid-js'
import { BsPencil, BsXLg } from 'solid-icons/bs'
import type { Label } from '../../../shared/annotations'
import {
  fallbackShortcutLabel,
  isLabelGroupEnd,
  shortcutCodeForLabelIndex
} from '../lib/label-shortcuts'
import { createKeyboardLayoutLabels } from '../lib/useKeyboardLayoutLabels'
import { useProjectContext } from '../lib/project-context'
import LabelColorPicker, { type PickerSession } from './LabelColorPicker'
import KeyboardHint from './KeyboardHint'

const LabelPanel: Component<{
  labels: () => Label[]
  activeLabelId: () => string | null
  onSelect: (id: string) => void
  onCreate: (name: string, color?: string) => Promise<void>
  onUpdate: (label: Label) => Promise<void>
  onDelete: (id: string) => Promise<void>
  showShortcuts: () => boolean
  error: () => string | null
}> = (props) => {
  const project = useProjectContext()
  const [newName, setNewName] = createSignal('')
  const [editingId, setEditingId] = createSignal<string | null>(null)
  const [editName, setEditName] = createSignal('')
  const [colorPicker, setColorPicker] = createSignal<PickerSession | null>(null)
  let skipEditBlurSave = false
  const layoutLabels = createKeyboardLayoutLabels()

  const shortcutHint = (index: number): string | null => {
    const code = shortcutCodeForLabelIndex(index)
    if (!code) return null
    return layoutLabels().get(code) ?? fallbackShortcutLabel(code)
  }

  const closeColorPicker = (): void => {
    setColorPicker(null)
  }

  const toggleColorPicker = (labelId: string, trigger: HTMLElement): void => {
    setColorPicker((current) => {
      if (current?.labelId === labelId) return null
      const rect = trigger.getBoundingClientRect()
      return { labelId, trigger, rect }
    })
  }

  const startEditName = (label: Label): void => {
    closeColorPicker()
    setEditingId(label.id)
    setEditName(label.name)
  }

  const cancelEditName = (): void => {
    skipEditBlurSave = true
    setEditingId(null)
  }

  const handleCreate = async (): Promise<void> => {
    const name = newName().trim()
    if (!name) return
    await props.onCreate(name)
    setNewName('')
  }

  const handleSaveName = (label: Label, nextName = editName()): void => {
    const name = nextName.trim()
    // Leave edit mode synchronously so parent Enter/submit handlers cannot race.
    cancelEditName()
    if (!name || name === label.name) return
    void props.onUpdate({ ...label, name })
  }

  const handleColorChange = async (label: Label, color: string): Promise<void> => {
    await props.onUpdate({ ...label, color })
  }

  return (
    <section class="flex min-h-0 flex-1 flex-col">
      <div class="px-3 pt-2.5 pb-2 text-[11px] font-semibold tracking-wide text-base-content/60">
        LABELS
      </div>
      <div class="flex-1 overflow-auto px-2 pb-2">
        <Show when={props.error()}>
          <div class="mb-2 text-xs text-error">{props.error()}</div>
        </Show>

        <Index each={props.labels()}>
          {(label, index) => (
            <div
              class="flex h-5 items-center gap-0 rounded"
              classList={{
                'bg-primary/15': props.activeLabelId() === label().id,
                'mb-2.5': isLabelGroupEnd(index, props.labels().length)
              }}
            >
              <button
                type="button"
                class="btn btn-ghost btn-xs h-5 min-h-0! w-5 shrink-0 px-0"
                title="Change color"
                aria-label={`Change color for ${label().name}`}
                aria-expanded={colorPicker()?.labelId === label().id}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleColorPicker(label().id, event.currentTarget)
                }}
              >
                <span
                  class="h-2.5 w-2.5 shrink-0 rounded-sm shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-base-content)_18%,transparent)]"
                  style={{ background: label().color }}
                />
              </button>

              <Show
                when={editingId() === label().id}
                fallback={
                  <>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs h-5 min-h-0! min-w-0 flex-1 justify-start px-1 py-0! text-xs font-normal leading-none"
                      onClick={() => props.onSelect(label().id)}
                    >
                      <span class="truncate">{label().name}</span>
                    </button>
                    <Show when={props.showShortcuts() && shortcutHint(index)}>
                      {(hint) => {
                        const code = (): string | null => shortcutCodeForLabelIndex(index)
                        return (
                          <KeyboardHint
                            size="md"
                            title={`Select label (${hint()})`}
                            pressed={() => {
                              if (!props.showShortcuts()) return false
                              const shortcutCode = code()
                              if (!shortcutCode) return false
                              const keys = project.pressedKeys()
                              if (
                                keys.has('Backquote') &&
                                (shortcutCode === 'Digit1' || shortcutCode === 'Digit2')
                              ) {
                                return false
                              }
                              return keys.has(shortcutCode)
                            }}
                          >
                            {hint()}
                          </KeyboardHint>
                        )
                      }}
                    </Show>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs btn-square h-5 min-h-0! w-5 p-0! text-base-content/45"
                      title="Rename label"
                      aria-label={`Rename ${label().name}`}
                      onClick={() => startEditName(label())}
                    >
                      <BsPencil size={12} aria-hidden="true" />
                    </button>
                  </>
                }
              >
                <input
                  class="input input-bordered input-xs bg-base-100 font-inherit h-5 min-h-5! min-w-0 flex-1 px-1 py-0! leading-none"
                  value={editName()}
                  ref={(element) => queueMicrotask(() => element.focus())}
                  on:input={(event) => setEditName(event.currentTarget.value)}
                  on:keydown={(event) => {
                    if (event.isComposing) return
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      event.stopPropagation()
                      handleSaveName(label(), event.currentTarget.value)
                      return
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      event.stopPropagation()
                      cancelEditName()
                    }
                  }}
                  onBlur={() => {
                    if (skipEditBlurSave) {
                      skipEditBlurSave = false
                      return
                    }
                    handleSaveName(label())
                  }}
                />
              </Show>

              <button
                type="button"
                class="btn btn-ghost btn-xs btn-square h-5 min-h-0! w-5 p-0! text-error/55 hover:text-error"
                title="Delete label"
                aria-label={`Delete ${label().name}`}
                onClick={() => void props.onDelete(label().id)}
              >
                <BsXLg size={12} aria-hidden="true" />
              </button>
            </div>
          )}
        </Index>

        <div class="mt-2 flex items-center gap-1.5">
          <input
            class="input input-bordered input-sm bg-base-100 font-inherit h-8 min-h-8 min-w-0 flex-1"
            placeholder="New label"
            value={newName()}
            onInput={(event) => setNewName(event.currentTarget.value)}
            on:keydown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              void handleCreate().then(() => event.currentTarget.blur())
            }}
          />
          <button
            type="button"
            class="btn btn-sm btn-outline shrink-0"
            disabled={!newName().trim()}
            onClick={() => void handleCreate()}
          >
            Add
          </button>
        </div>
      </div>

      <LabelColorPicker
        labels={props.labels}
        open={colorPicker}
        onClose={closeColorPicker}
        onColorChange={handleColorChange}
      />
    </section>
  )
}

export default LabelPanel
