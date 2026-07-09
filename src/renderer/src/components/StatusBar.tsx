import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import type { FileInfo } from './FileViewer'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}

const StatusBar: Component<{ info: () => FileInfo | null }> = (props) => (
  <footer class="statusbar border-base-300 bg-base-200 text-base-content/60 border-t">
    <Show when={props.info()}>
      {(info) => (
        <div class="statusbar-items">
          <span class="statusbar-item">{info().dirty ? `${info().name} •` : info().name}</span>
          <Show when={info().width && info().height}>
            <span class="statusbar-separator bg-base-300" />
            <span class="statusbar-item">
              {info().width}×{info().height}
            </span>
          </Show>
          <Show when={info().lines}>
            <span class="statusbar-separator bg-base-300" />
            <span class="statusbar-item">{info().lines} lines</span>
          </Show>
          <span class="statusbar-separator bg-base-300" />
          <span class="statusbar-item">{formatSize(info().size)}</span>
        </div>
      )}
    </Show>
  </footer>
)

export default StatusBar
