import type { Component } from 'solid-js'
import {
  MAX_BRUSH_DIAMETER_IMAGE_PX,
  MIN_BRUSH_DIAMETER_IMAGE_PX
} from '../lib/brush/constants'

const BrushSettings: Component<{
  brushSize: () => number
  onBrushSizeChange: (size: number) => void
}> = (props) => (
  <section class="brush-settings">
    <div class="brush-settings-header text-base-content/60">BRUSH</div>
    <div class="brush-settings-body">
      <label class="brush-settings-row">
        <span class="brush-settings-label">Size</span>
        <input
          type="range"
          class="brush-settings-slider"
          min={MIN_BRUSH_DIAMETER_IMAGE_PX}
          max={MAX_BRUSH_DIAMETER_IMAGE_PX}
          step={1}
          value={props.brushSize()}
          onInput={(event) => props.onBrushSizeChange(Number(event.currentTarget.value))}
        />
        <span class="brush-settings-value">{props.brushSize()}px</span>
      </label>
    </div>
  </section>
)

export default BrushSettings
