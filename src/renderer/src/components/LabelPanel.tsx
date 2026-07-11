import type { Component } from 'solid-js'
import { For, Index, Show, createEffect, createMemo, createSignal } from 'solid-js'
import { BsPencil, BsXLg } from 'solid-icons/bs'
import type { Label } from '../../../shared/annotations'
import { LABEL_COLORS } from '../../../shared/annotations'
import {
  hexColorsEqual,
  isLabelPaletteColor,
  isValidHexColor,
  normalizeHexColor,
  parseCompleteHexColor
} from '../../../shared/label-color'
import FloatingPopover from './FloatingPopover'

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
  const [colorPickerRef, setColorPickerRef] = createSignal<HTMLElement | undefined>()
  const [hexDraft, setHexDraft] = createSignal('')
  const hexPreview = createMemo(() => parseCompleteHexColor(hexDraft()))

  const colorPickerLabel = createMemo(() => {
    const id = colorPickerId()
    if (!id) return null
    return props.labels().find((label) => label.id === id) ?? null
  })

  createEffect(() => {
    const label = colorPickerLabel()
    if (!label) {
      setHexDraft('')
      return
    }
    setHexDraft(isLabelPaletteColor(label.color) ? '' : normalizeHexColor(label.color))
  })

  const startEditName = (label: Label): void => {
    setColorPickerId(null)
    setColorPickerRef(undefined)
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
    if (hexColorsEqual(color, label.color)) return
    await props.onUpdate({ ...label, color })
  }

  const handleHexSubmit = async (label: Label): Promise<void> => {
    const draft = hexDraft().trim()
    if (!draft || !isValidHexColor(draft)) return
    await handleColorChange(label, normalizeHexColor(draft))
  }

  const closeColorPicker = (): void => {
    setColorPickerId(null)
    setColorPickerRef(undefined)
  }

  const toggleColorPicker = (labelId: string, button: HTMLElement): void => {
    setColorPickerId((current) => {
      if (current === labelId) {
        setColorPickerRef(undefined)
        return null
      }
      setColorPickerRef(button)
      return labelId
    })
  }

  return (
    <section class="flex min-h-0 flex-1 flex-col">
      <div class="px-3 pt-2.5 pb-2 text-[11px] font-semibold tracking-wide text-base-content/60">LABELS</div>
      <div class="flex-1 overflow-auto px-2 pb-2">
        <Show when={props.error()}>
          <div class="mb-2 text-xs text-error">{props.error()}</div>
        </Show>

        <Index each={props.labels()}>
          {(label) => (
            <div
              class="mb-1 flex items-center gap-1 rounded"
              classList={{ 'bg-primary/15': props.activeLabelId() === label().id }}
            >
              <div class="shrink-0">
                <button
                  type="button"
                  class="btn btn-ghost btn-xs h-auto min-h-0 px-1 py-1.5"
                  title="Change color"
                  aria-label={`Change color for ${label().name}`}
                  aria-expanded={colorPickerId() === label().id}
                  ref={(element) => {
                    if (colorPickerId() === label().id) setColorPickerRef(element)
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleColorPicker(label().id, event.currentTarget)
                  }}
                >
                  <span
                    class="h-3 w-3 shrink-0 rounded-sm shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-base-content)_18%,transparent)]"
                    style={{ background: label().color }}
                  />
                </button>
              </div>

              <Show
                when={editingId() === label().id}
                fallback={
                  <>
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm h-auto min-h-0 flex-1 justify-start px-1 py-1.5 text-xs font-normal"
                      onClick={() => props.onSelect(label().id)}
                    >
                      <span class="truncate">{label().name}</span>
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs btn-square text-base-content/45"
                      title="Rename label"
                      aria-label={`Rename ${label().name}`}
                      onClick={() => startEditName(label())}
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
                    if (event.key === 'Enter') void handleSaveName(label())
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      event.stopPropagation()
                      cancelEditName()
                    }
                  }}
                  onBlur={() => void handleSaveName(label())}
                />
              </Show>

              <button
                type="button"
                class="btn btn-ghost btn-xs btn-square text-error/55 hover:text-error"
                title="Delete label"
                aria-label={`Delete ${label().name}`}
                onClick={() => void props.onDelete(label().id)}
              >
                <BsXLg size={16} aria-hidden="true" />
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
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleCreate()
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

      <FloatingPopover
        open={() => colorPickerId() !== null}
        reference={() => colorPickerRef()}
        placement="bottom-start"
        fitContent
        panelClass="p-1.5"
        onClose={closeColorPicker}
      >
        <Show when={colorPickerId()}>
          <div class="flex w-fit flex-col gap-1.5">
            <div role="listbox" aria-label="Label colors" class="grid grid-cols-6 gap-1">
              <For each={[...LABEL_COLORS]}>
                {(color) => {
                  const selected = (): boolean => {
                    const current = colorPickerLabel()
                    return current ? hexColorsEqual(color, current.color) : false
                  }
                  return (
                    <div
                      class="relative h-5 w-5 rounded-sm"
                      classList={{
                        'outline outline-2 outline-offset-1 outline-base-content': selected()
                      }}
                    >
                      <button
                        type="button"
                        role="option"
                        data-color-swatch
                        class="h-full w-full cursor-pointer rounded-sm border-none shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-base-content)_14%,transparent)]"
                        style={{ background: color }}
                        title={color}
                        aria-label={color}
                        aria-selected={selected()}
                        onClick={() => {
                          const current = colorPickerLabel()
                          if (current) void handleColorChange(current, color)
                        }}
                      />
                    </div>
                  )
                }}
              </For>
            </div>
            <div class="flex items-center gap-1.5">
              <input
                class="input input-bordered input-xs bg-base-100 font-mono h-5 min-h-5 w-[6.75rem] px-1.5"
                placeholder="#RRGGBB"
                aria-label="Custom hex color"
                spellcheck={false}
                value={hexDraft()}
                onInput={(event) => setHexDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    const current = colorPickerLabel()
                    if (current) void handleHexSubmit(current)
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    closeColorPicker()
                  }
                }}
                onBlur={() => {
                  const current = colorPickerLabel()
                  if (current) void handleHexSubmit(current)
                }}
              />
              <span
                class="h-5 w-5 shrink-0 rounded-sm shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-base-content)_14%,transparent)]"
                classList={{ 'bg-base-200': !hexPreview() }}
                style={hexPreview() ? { background: hexPreview()! } : undefined}
                title={hexPreview() ?? undefined}
                aria-hidden="true"
              />
            </div>
          </div>
        </Show>
      </FloatingPopover>
    </section>
  )
}

export default LabelPanel
