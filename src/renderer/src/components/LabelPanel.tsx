import type { Component } from 'solid-js'
import { For, Show, createEffect, createSignal } from 'solid-js'
import type { Label } from '../../../shared/annotations'
import { LABEL_COLORS } from '../../../shared/annotations'
import { getLabelColor } from '../../../shared/label-color'

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
  const [newColor, setNewColor] = createSignal<string>(LABEL_COLORS[0])
  const [colorManuallySet, setColorManuallySet] = createSignal(false)
  const [editingId, setEditingId] = createSignal<string | null>(null)
  const [editName, setEditName] = createSignal('')
  const [editColor, setEditColor] = createSignal<string>(LABEL_COLORS[0])

  createEffect(() => {
    const name = newName().trim()
    if (colorManuallySet() || !name) return
    setNewColor(getLabelColor(name, props.labels().map((label) => label.color)))
  })

  const startEdit = (label: Label): void => {
    setEditingId(label.id)
    setEditName(label.name)
    setEditColor(label.color)
  }

  const handleCreate = async (): Promise<void> => {
    const name = newName().trim()
    if (!name) return
    await props.onCreate(name, colorManuallySet() ? newColor() : undefined)
    setNewName('')
    setColorManuallySet(false)
  }

  const handleSaveEdit = async (label: Label): Promise<void> => {
    const name = editName().trim()
    if (!name) return
    await props.onUpdate({ ...label, name, color: editColor() })
    setEditingId(null)
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
              <Show
                when={editingId() === label.id}
                fallback={
                  <>
                    <button
                      type="button"
                      class="label-panel-select"
                      onClick={() => props.onSelect(label.id)}
                    >
                      <span class="label-panel-swatch" style={{ background: label.color }} />
                      <span class="label-panel-name">{label.name}</span>
                    </button>
                    <div class="label-panel-actions">
                      <button type="button" class="label-panel-action" onClick={() => startEdit(label)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        class="label-panel-action label-panel-action--danger"
                        onClick={() => void props.onDelete(label.id)}
                      >
                        Del
                      </button>
                    </div>
                  </>
                }
              >
                <input
                  class="label-panel-input"
                  value={editName()}
                  onInput={(event) => setEditName(event.currentTarget.value)}
                />
                <select
                  class="label-panel-color"
                  value={editColor()}
                  onChange={(event) => setEditColor(event.currentTarget.value)}
                >
                  <For each={[...LABEL_COLORS]}>
                    {(color) => <option value={color}>{color}</option>}
                  </For>
                </select>
                <button
                  type="button"
                  class="label-panel-action"
                  onClick={() => void handleSaveEdit(label)}
                >
                  Save
                </button>
              </Show>
            </div>
          )}
        </For>

        <div class="label-panel-create">
          <input
            class="label-panel-input"
            placeholder="New label"
            value={newName()}
            onInput={(event) => {
              setNewName(event.currentTarget.value)
              setColorManuallySet(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleCreate()
            }}
          />
          <select
            class="label-panel-color"
            value={newColor()}
            onChange={(event) => {
              setNewColor(event.currentTarget.value)
              setColorManuallySet(true)
            }}
          >
            <For each={[...LABEL_COLORS]}>
              {(color) => <option value={color}>{color}</option>}
            </For>
          </select>
          <button type="button" class="label-panel-add" onClick={() => void handleCreate()}>
            Add
          </button>
        </div>
      </div>
    </section>
  )
}

export default LabelPanel
