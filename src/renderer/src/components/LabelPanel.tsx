import type { Component } from 'solid-js'
import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { BsPencil, BsXLg } from 'solid-icons/bs'
import type { Label } from '../../../shared/annotations'
import { LABEL_COLORS } from '../../../shared/annotations'

const LabelPanel: Component<{
  labels: () => Label[]
  activeLabelId: () => string | null
  onSelect: (id: string) => void
  onCreate: (name: string, color?: string) => Promise<void>
  onUpdate: (label: Label) => Promise<void>
  onDelete: (id: string) => Promise<void>
  error: () => string | null
}> = (props) => {
  const [newName, setNewName] = createSignal('')
  const [editingId, setEditingId] = createSignal<string | null>(null)
  const [editName, setEditName] = createSignal('')
  const [colorPickerId, setColorPickerId] = createSignal<string | null>(null)

  createEffect(() => {
    if (!colorPickerId()) return

    const close = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (target instanceof Element && target.closest('[data-color-picker]')) return
      setColorPickerId(null)
    }

    const timer = window.setTimeout(() => document.addEventListener('mousedown', close), 0)
    onCleanup(() => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', close)
    })
  })

  const startEditName = (label: Label): void => {
    setColorPickerId(null)
    setEditingId(label.id)
    setEditName(label.name)
  }

  const cancelEditName = (): void => {
    setEditingId(null)
  }

  const handleCreate = async (): Promise<void> => {
    const name = newName().trim()
    if (!name) return
    await props.onCreate(name)
    setNewName('')
  }

  const handleSaveName = async (label: Label): Promise<void> => {
    const name = editName().trim()
    if (!name) {
      cancelEditName()
      return
    }
    if (name !== label.name) {
      await props.onUpdate({ ...label, name })
    }
    cancelEditName()
  }

  const handleColorChange = async (label: Label, color: string): Promise<void> => {
    if (color === label.color) {
      setColorPickerId(null)
      return
    }
    await props.onUpdate({ ...label, color })
    setColorPickerId(null)
  }

  const toggleColorPicker = (labelId: string): void => {
    setColorPickerId((current) => (current === labelId ? null : labelId))
  }

  return (
    <section class="flex min-h-0 flex-1 flex-col">
      <div class="px-3 pt-2.5 pb-2 text-[11px] font-semibold tracking-wide text-base-content/60">LABELS</div>
      <div class="flex-1 overflow-auto px-2 pb-2">
        <Show when={props.error()}>
          <div class="mb-2 text-xs text-error">{props.error()}</div>
        </Show>

        <For each={props.labels()}>
          {(label) => (
            <div
              class="mb-1 flex items-center gap-1 rounded"
              classList={{ 'bg-primary/15': props.activeLabelId() === label.id }}
            >
              <div class="relative shrink-0" data-color-picker>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs h-auto min-h-0 px-1 py-1.5"
                  title="Change color"
                  aria-label={`Change color for ${label.name}`}
                  aria-expanded={colorPickerId() === label.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleColorPicker(label.id)
                  }}
                >
                  <span
                    class="h-3 w-3 shrink-0 rounded-sm shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-base-content)_18%,transparent)]"
                    style={{ background: label.color }}
                  />
                </button>
                <Show when={colorPickerId() === label.id}>
                  <div
                    class="absolute top-[calc(100%+4px)] left-0 z-20 grid w-[156px] grid-cols-6 gap-1 rounded-md border border-base-content/12 bg-base-100 p-1.5 shadow-lg"
                    role="listbox"
                    aria-label="Label colors"
                    data-color-picker
                  >
                    <For each={[...LABEL_COLORS]}>
                      {(color) => (
                        <button
                          type="button"
                          role="option"
                          class="h-5 w-5 cursor-pointer rounded-sm border-none shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-base-content)_14%,transparent)]"
                          classList={{
                            'shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-base-content)_14%,transparent),0_0_0_2px_var(--color-base-100),0_0_0_3px_var(--color-primary)]':
                              color === label.color
                          }}
                          style={{ background: color }}
                          title={color}
                          aria-label={color}
                          aria-selected={color === label.color}
                          onClick={() => void handleColorChange(label, color)}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </div>

              <Show
                when={editingId() === label.id}
                fallback={
                  <>
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm h-auto min-h-0 flex-1 justify-start px-1 py-1.5 text-xs font-normal"
                      onClick={() => props.onSelect(label.id)}
                    >
                      <span class="truncate">{label.name}</span>
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs btn-square text-base-content/45"
                      title="Rename label"
                      aria-label={`Rename ${label.name}`}
                      onClick={() => startEditName(label)}
                    >
                      <BsPencil size={16} aria-hidden="true" />
                    </button>
                  </>
                }
              >
                <input
                  class="input input-bordered input-sm bg-base-100 font-inherit h-8 min-h-8 min-w-0 flex-1"
                  value={editName()}
                  ref={(element) => queueMicrotask(() => element.focus())}
                  onInput={(event) => setEditName(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleSaveName(label)
                    if (event.key === 'Escape') cancelEditName()
                  }}
                  onBlur={() => void handleSaveName(label)}
                />
              </Show>

              <button
                type="button"
                class="btn btn-ghost btn-xs btn-square text-error/55 hover:text-error"
                title="Delete label"
                aria-label={`Delete ${label.name}`}
                onClick={() => void props.onDelete(label.id)}
              >
                <BsXLg size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </For>

        <div class="mt-2 flex flex-col gap-1.5">
          <input
            class="input input-bordered input-sm bg-base-100 font-inherit h-8 min-h-8 w-full"
            placeholder="New label"
            value={newName()}
            onInput={(event) => setNewName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleCreate()
            }}
          />
          <button type="button" class="btn btn-sm btn-outline w-full" onClick={() => void handleCreate()}>
            Add
          </button>
        </div>
      </div>
    </section>
  )
}

export default LabelPanel
