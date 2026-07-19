import type { Component } from 'solid-js'
import { Show, createSignal, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import type { ImageRecord, ImageStatus } from '../../../shared/annotations'
import { formatTimestamp, timeToDoneLabel } from '../lib/image-timing'
import { useProjectContext } from '../lib/project-context'
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
  const project = useProjectContext()
  const [tipPos, setTipPos] = createSignal<{ x: number; y: number } | null>(null)

  const isImage = (): boolean => {
    const info = props.info()
    return Boolean(info?.width && info?.height)
  }

  const showTip = (event: { currentTarget: EventTarget | null }): void => {
    const el = event.currentTarget
    if (!(el instanceof HTMLElement)) return
    const rect = el.getBoundingClientRect()
    setTipPos({ x: rect.left + rect.width / 2, y: rect.top })
  }

  const hideTip = (): void => {
    setTipPos(null)
  }

  onCleanup(() => {
    setTipPos(null)
  })

  return (
    <footer class="flex h-[var(--statusbar-height)] min-h-[var(--statusbar-height)] w-full shrink-0 items-center justify-between gap-2 border-base-300 bg-base-200 px-3 text-xs text-base-content/60 border-t">
      <ToolControlHints isImage={isImage} />
      <Show when={props.info()}>
        {(info) => (
          <div class="flex shrink-0 items-center">
            <Show when={isImage() && project.pointerPixel() != null}>
              <span class="whitespace-nowrap px-2 tabular-nums">
                {project.pointerPixel()!.x}, {project.pointerPixel()!.y}
              </span>
              <span class="h-3.5 w-px bg-base-300" />
            </Show>
            <span class="inline-flex items-center gap-1.5 whitespace-nowrap px-2">
              <Show when={props.imageStatus?.()}>
                {(status) => (
                  <button
                    type="button"
                    class="inline-flex h-4 w-4 items-center justify-center rounded-sm"
                    aria-label={`Status: ${status()}`}
                    onMouseEnter={showTip}
                    onMouseLeave={hideTip}
                    onFocus={showTip}
                    onBlur={hideTip}
                  >
                    <span
                      class={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass(status())}`}
                    />
                  </button>
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
      <Show when={tipPos()}>
        {(pos) => {
          const meta = (): ImageRecord | null | undefined => props.imageMeta?.()
          return (
            <Portal>
              <div
                class="pointer-events-none fixed z-9999 -translate-x-1/2 -translate-y-full rounded-box border border-base-300 bg-base-100 px-2 py-1.5 text-left text-[11px] leading-relaxed text-base-content shadow-sm"
                style={{
                  left: `${pos().x}px`,
                  top: `${pos().y - 6}px`
                }}
              >
                <div>Time to done: {timeToDoneLabel(meta()?.firstLabeledAt, meta()?.doneAt)}</div>
                <div>Done at: {formatTimestamp(meta()?.doneAt)}</div>
                <div>Opened: {formatTimestamp(meta()?.openedAt)}</div>
              </div>
            </Portal>
          )
        }}
      </Show>
    </footer>
  )
}

export default StatusBar
