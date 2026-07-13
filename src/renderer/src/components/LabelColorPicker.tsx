import type { Component } from 'solid-js'
import { For, createEffect, createMemo, createSignal } from 'solid-js'
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

export type PickerSession = {
  labelId: string
  trigger: HTMLElement
}

const LabelColorPicker: Component<{
  labels: () => Label[]
  open: () => PickerSession | null
  onClose: () => void
  onColorChange: (label: Label, color: string) => Promise<void>
}> = (props) => {
  const [hexDraft, setHexDraft] = createSignal('')
  const hexPreview = createMemo(() => parseCompleteHexColor(hexDraft()))

  const activeLabel = createMemo(() => {
    const session = props.open()
    if (!session) return null
    return props.labels().find((label) => label.id === session.labelId) ?? null
  })

  createEffect(() => {
    const label = activeLabel()
    if (!label) {
      setHexDraft('')
      return
    }
    setHexDraft(isLabelPaletteColor(label.color) ? '' : normalizeHexColor(label.color))
  })

  const handleHexSubmit = async (): Promise<void> => {
    const label = activeLabel()
    if (!label) return
    const draft = hexDraft().trim()
    if (!draft || !isValidHexColor(draft)) return
    if (hexColorsEqual(draft, label.color)) return
    await props.onColorChange(label, normalizeHexColor(draft))
  }

  return (
    <FloatingPopover
      open={() => props.open() !== null}
      onClose={props.onClose}
      reference={() => props.open()?.trigger}
      placement="bottom-start"
      contentRole="dialog"
      panelClass="p-1.5"
    >
      <div class="flex w-fit flex-col gap-1.5" aria-label="Label colors">
        <div role="listbox" aria-label="Label colors" class="grid grid-cols-6 gap-1">
          <For each={[...LABEL_COLORS]}>
            {(color) => {
              const selected = (): boolean => {
                const label = activeLabel()
                return label ? hexColorsEqual(color, label.color) : false
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
                      const label = activeLabel()
                      if (label) void props.onColorChange(label, color)
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
            on:keydown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleHexSubmit().then(() => event.currentTarget.blur())
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                props.onClose()
              }
            }}
            onBlur={() => void handleHexSubmit()}
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
    </FloatingPopover>
  )
}

export default LabelColorPicker
