import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import type { ImageRecord, ImageStatus } from '../../../shared/annotations'
import { formatTimestamp, timeToDoneLabel } from '../lib/image-timing'
import type { FileInfo } from './FileViewer'
import ToolControlHints from './ToolControlHints'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}

function statusDotClass(status: ImageStatus): string {
  if (status === 'in_progress') return 'bg-primary'
  if (status === 'done') return 'bg-green-500'
  if (status === 'skipped') return 'bg-neutral'
  return 'bg-base-content/25'
}

const StatusBar: Component<{
  info: () => FileInfo | null
  imagePosition?: () => { index: number; total: number } | null
  imageStatus?: () => ImageStatus | null
  imageMeta?: () => ImageRecord | null
}> = (props) => {
  const isImage = (): boolean => {
    const info = props.info()
    return Boolean(info?.width && info?.height)
  }

  const tooltipText = (): string => {
    const meta = props.imageMeta?.()
    const timeToDone = timeToDoneLabel(meta?.firstLabeledAt, meta?.doneAt)
    const doneAt = formatTimestamp(meta?.doneAt)
    const openedAt = formatTimestamp(meta?.openedAt)
    return `Time to done: ${timeToDone}\nDone at: ${doneAt}\nOpened: ${openedAt}`
  }

  return (
    <footer class="flex h-[var(--statusbar-height)] min-h-[var(--statusbar-height)] w-full shrink-0 items-center justify-between gap-2 border-base-300 bg-base-200 px-3 text-xs text-base-content/60 border-t">
      <ToolControlHints isImage={isImage} />
      <Show when={props.info()}>
        {(info) => (
          <div class="flex shrink-0 items-center">
            <span class="inline-flex items-center gap-1.5 whitespace-nowrap px-2">
              <Show when={props.imageStatus?.()}>
                {(status) => (
                  <span
                    class="tooltip tooltip-top tooltip-left before:whitespace-pre-line"
                    data-tip={tooltipText()}
                  >
                    <span
                      class={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass(status())}`}
                      aria-label={`Status: ${status()}`}
                    />
                  </span>
                )}
              </Show>
              <span>{info().dirty ? `${info().name} •` : info().name}</span>
            </span>
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
            <Show when={props.imagePosition?.()}>
              {(position) => (
                <>
                  <span class="h-3.5 w-px bg-base-300" />
                  <span class="whitespace-nowrap px-2 tabular-nums">
                    {position().index + 1} / {position().total}
                  </span>
                </>
              )}
            </Show>
          </div>
        )}
      </Show>
    </footer>
  )
}

export default StatusBar
