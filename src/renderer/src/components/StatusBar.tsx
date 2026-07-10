import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import type { FileInfo } from './FileViewer'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}

const StatusBar: Component<{ info: () => FileInfo | null }> = (props) => (
  <footer class="flex h-[var(--statusbar-height)] min-h-[var(--statusbar-height)] w-full shrink-0 items-center justify-end border-base-300 bg-base-200 px-3 text-xs text-base-content/60 border-t">
    <Show when={props.info()}>
      {(info) => (
        <div class="flex items-center">
          <span class="whitespace-nowrap px-2">{info().dirty ? `${info().name} •` : info().name}</span>
          <Show when={info().width && info().height}>
            <span class="h-3.5 w-px bg-base-300" />
            <span class="whitespace-nowrap px-2">
              {info().width}×{info().height}
            </span>
          </Show>
          <Show when={info().lines}>
            <span class="h-3.5 w-px bg-base-300" />
            <span class="whitespace-nowrap px-2">{info().lines} lines</span>
          </Show>
          <span class="h-3.5 w-px bg-base-300" />
          <span class="whitespace-nowrap px-2">{formatSize(info().size)}</span>
        </div>
      )}
    </Show>
  </footer>
)

export default StatusBar
