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
    <section class="brush-settings">
      <div class="brush-settings-header text-base-content/60">BRUSH</div>
      <div class="brush-settings-body">
        <label class="brush-settings-row">
          <span class="brush-settings-label">Size</span>
          <input
            type="range"
            class="brush-settings-slider"
            min={0}
            max={BRUSH_SIZE_SLIDER_STEPS}
            step={1}
            value={brushSizeToSliderValue(props.brushSize())}
            onInput={(event) =>
              props.onBrushSizeChange(sliderValueToBrushSize(Number(event.currentTarget.value)))
            }
          />
          <span class="brush-settings-input-wrap">
            <input
              type="number"
              class="brush-settings-input"
              min={MIN_BRUSH_DIAMETER_IMAGE_PX}
              step={1}
              value={props.brushSize()}
              onInput={(event) => commitBrushSizeInput(event.currentTarget.value)}
            />
            <span class="brush-settings-input-suffix">px</span>
          </span>
        </label>
        <label class="brush-settings-toggle-row">
          <span class="brush-settings-toggle-label">Fine at max zoom</span>
          <input
            type="checkbox"
            class="brush-settings-toggle"
            checked={props.shrinkAtMaxZoom()}
            onChange={(event) => props.onShrinkAtMaxZoomChange(event.currentTarget.checked)}
          />
        </label>
      </div>
    </section>
  )
}

export default BrushSettings
