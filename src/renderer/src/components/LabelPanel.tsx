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
      if (target instanceof Element && target.closest('.label-panel-swatch-wrap')) return
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
    <section class="label-panel">
      <div class="label-panel-header text-base-content/60">LABELS</div>
      <div class="label-panel-body">
        <Show when={props.error()}>
          <div class="label-panel-error text-error">{props.error()}</div>
        </Show>

        <For each={props.labels()}>
          {(label) => (
            <div
              class="label-panel-item"
              classList={{ 'label-panel-item--active': props.activeLabelId() === label.id }}
            >
              <div class="label-panel-swatch-wrap">
                <button
                  type="button"
                  class="label-panel-swatch-btn"
                  title="Change color"
                  aria-label={`Change color for ${label.name}`}
                  aria-expanded={colorPickerId() === label.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleColorPicker(label.id)
                  }}
                >
                  <span class="label-panel-swatch" style={{ background: label.color }} />
                </button>
                <Show when={colorPickerId() === label.id}>
                  <div class="label-panel-color-palette" role="listbox" aria-label="Label colors">
                    <For each={[...LABEL_COLORS]}>
                      {(color) => (
                        <button
                          type="button"
                          role="option"
                          class="label-panel-color-option"
                          classList={{ 'label-panel-color-option--active': color === label.color }}
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
                      class="label-panel-select"
                      onClick={() => props.onSelect(label.id)}
                    >
                      <span class="label-panel-name">{label.name}</span>
                    </button>
                    <button
                      type="button"
                      class="label-panel-edit-btn"
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
                  class="label-panel-input label-panel-input--inline"
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
                class="label-panel-delete-btn"
                title="Delete label"
                aria-label={`Delete ${label.name}`}
                onClick={() => void props.onDelete(label.id)}
              >
                <BsXLg size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </For>

        <div class="label-panel-create">
          <input
            class="label-panel-input"
            placeholder="New label"
            value={newName()}
            onInput={(event) => setNewName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleCreate()
            }}
          />
          <button type="button" class="label-panel-add" onClick={() => void handleCreate()}>
            Add
          </button>
        </div>
      </div>
    </section>
  )
}

export default LabelPanel
