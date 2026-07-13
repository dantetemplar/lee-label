import type { Component } from 'solid-js'
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'
import type { Label } from '../../../shared/annotations'
import { LABEL_COLORS } from '../../../shared/annotations'
import {
  hexColorsEqual,
  isLabelPaletteColor,
  isValidHexColor,
  normalizeHexColor,
  parseCompleteHexColor
} from '../../../shared/label-color'

export type PickerSession = {
  labelId: string
  trigger: HTMLElement
  /** Viewport rect captured in the click handler (stable if the trigger remounts). */
  rect: DOMRect
}

const LabelColorPicker: Component<{
  labels: () => Label[]
  open: () => PickerSession | null
  onClose: () => void
  onColorChange: (label: Label, color: string) => Promise<void>
}> = (props) => {
  const [panelEl, setPanelEl] = createSignal<HTMLDivElement | undefined>()
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

  createEffect(() => {
    const session = props.open()
    const panel = panelEl()
    if (!session || !panel) return

    const { trigger, rect } = session

    panel.style.position = 'fixed'
    panel.style.left = `${Math.round(rect.left)}px`
    panel.style.top = `${Math.round(rect.bottom + 4)}px`

    const reference = {
      getBoundingClientRect: () =>
        trigger.isConnected
          ? trigger.getBoundingClientRect()
          : DOMRect.fromRect({
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            })
    }

    const place = (): void => {
      void computePosition(reference, panel, {
        placement: 'bottom-start',
        strategy: 'fixed',
        middleware: [offset(4), flip(), shift({ padding: 8 })]
      }).then(({ x, y }) => {
        panel.style.left = `${Math.round(x)}px`
        panel.style.top = `${Math.round(y)}px`
      })
    }

    place()
    const stopAutoUpdate = autoUpdate(trigger.isConnected ? trigger : reference, panel, place)

    const isInside = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false
      if (panel.contains(target)) return true
      return trigger.isConnected && trigger.contains(target)
    }

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button > 0) return
      if (isInside(event.target)) return
      props.onClose()
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      props.onClose()
    }

    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true)
    }, 0)
    document.addEventListener('keydown', onKeyDown, true)

    onCleanup(() => {
      window.clearTimeout(timer)
      stopAutoUpdate()
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    })
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
    <Show when={props.open()}>
      <Portal>
        <div
          ref={setPanelEl}
          class="app z-50 w-fit rounded-lg border border-base-content/10 bg-base-100 p-1.5 shadow-lg"
          role="dialog"
          aria-label="Label colors"
        >
          <div class="flex w-fit flex-col gap-1.5">
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
        </div>
      </Portal>
    </Show>
  )
}

export default LabelColorPicker
