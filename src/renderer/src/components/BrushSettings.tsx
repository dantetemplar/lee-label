import type { Component } from 'solid-js'
import {
  BRUSH_SIZE_SLIDER_STEPS,
  MIN_BRUSH_DIAMETER_IMAGE_PX,
  brushSizeToSliderValue,
  normalizeBrushDiameter,
  sliderValueToBrushSize
} from '../lib/brush/constants'

const BrushSettings: Component<{
  brushSize: () => number
  onBrushSizeChange: (size: number) => void
  shrinkAtMaxZoom: () => boolean
  onShrinkAtMaxZoomChange: (enabled: boolean) => void
}> = (props) => {
  const commitBrushSizeInput = (raw: string): void => {
    const parsed = Number(raw)
    props.onBrushSizeChange(normalizeBrushDiameter(parsed))
  }

  return (
    <section class="shrink-0 border-b border-base-content/10">
      <div class="px-3 pt-2.5 pb-2 text-[11px] font-semibold tracking-wide text-base-content/60">BRUSH</div>
      <div class="px-3 pb-3">
        <label class="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs">
          <span class="min-w-7">Size</span>
          <div class="min-w-0">
            <input
              type="range"
              class="range range-xs range-primary w-full"
              min={0}
              max={BRUSH_SIZE_SLIDER_STEPS}
              step={1}
              value={brushSizeToSliderValue(props.brushSize())}
              onInput={(event) =>
                props.onBrushSizeChange(sliderValueToBrushSize(Number(event.currentTarget.value)))
              }
            />
          </div>
          <span class="inline-flex items-center gap-0.5">
            <input
              type="number"
              class="input input-bordered input-sm bg-base-100 font-inherit h-8 min-h-8 w-11 px-1 text-right tabular-nums"
              min={MIN_BRUSH_DIAMETER_IMAGE_PX}
              step={1}
              value={props.brushSize()}
              onInput={(event) => commitBrushSizeInput(event.currentTarget.value)}
            />
            <span class="text-xs text-base-content/70">px</span>
          </span>
        </label>
        <label class="mt-2.5 flex cursor-pointer items-center justify-between gap-2 text-xs">
          <span class="leading-snug">Fine at max zoom</span>
          <input
            type="checkbox"
            class="toggle toggle-sm toggle-primary"
            checked={props.shrinkAtMaxZoom()}
            onChange={(event) => props.onShrinkAtMaxZoomChange(event.currentTarget.checked)}
          />
        </label>
      </div>
    </section>
  )
}

export default BrushSettings
