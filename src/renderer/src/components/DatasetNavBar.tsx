import type { Component, JSX } from 'solid-js'
import { createSignal, For, Show } from 'solid-js'
import {
  BsBan,
  BsBanFill,
  BsCheckCircle,
  BsCheckCircleFill,
  BsChevronBarLeft,
  BsChevronBarRight,
  BsChevronDoubleLeft,
  BsChevronDoubleRight,
  BsChevronLeft,
  BsChevronRight,
  BsCircle,
  BsClock,
  BsClockFill
} from 'solid-icons/bs'
import type { ImageStatus } from '../../../shared/annotations'
import type { FileEntry } from '../../../shared/types'
import { NextUnfinishedIcon } from '../lib/dataset-nav-icons'
import FileSearchPopover from './FileSearchPopover'

export const DATASET_NAV_STEP = 10
const NAV_ICON_SIZE = 18

export interface DatasetNavStats {
  position: { index: number; total: number } | null
  done: number
  skipped: number
  left: number
  total: number
  allReviewed: boolean
}

function statusSegmentClass(status: ImageStatus): string {
  if (status === 'done') return 'bg-green-600'
  if (status === 'skipped') return 'bg-neutral'
  if (status === 'in_progress') return 'bg-primary'
  return 'bg-transparent'
}

function statusPointerClass(status: ImageStatus): string {
  if (status === 'done') return 'bg-green-600'
  if (status === 'skipped') return 'bg-neutral'
  if (status === 'in_progress') return 'bg-primary'
  return 'bg-base-content'
}

const TransportButton: Component<{
  title: string
  label: string
  disabled?: boolean
  active?: boolean
  wide?: boolean
  class?: string
  activeClass?: string
  onClick: () => void
  children: JSX.Element
}> = (props) => (
  <span class="inline-flex" title={props.title}>
    <button
      type="button"
      class={`btn btn-ghost flex h-7 min-h-7 items-center justify-center p-0 disabled:pointer-events-none disabled:bg-transparent disabled:text-base-content/45 disabled:opacity-100! ${props.wide ? 'w-auto min-w-7 px-1' : 'btn-square w-7 min-w-7'} ${props.active ? (props.activeClass ?? 'bg-base-300') : ''} ${props.class ?? 'text-base-content'}`}
      disabled={props.disabled === true}
      aria-label={props.label}
      aria-pressed={props.active === true}
      aria-disabled={props.disabled === true}
      onClick={() => {
        if (props.disabled) return
        props.onClick()
      }}
    >
      {props.children}
    </button>
  </span>
)

const StatusIconSlot: Component<{ children: JSX.Element }> = (props) => (
  <span
    class="inline-flex shrink-0 items-center justify-center"
    style={{ width: `${NAV_ICON_SIZE}px`, height: `${NAV_ICON_SIZE}px` }}
  >
    {props.children}
  </span>
)

const FloatingChip: Component<{ children: JSX.Element; class?: string }> = (props) => (
  <div
    class={`pointer-events-auto flex items-center rounded-box border border-base-300 bg-base-100/95 px-1 shadow-md backdrop-blur-sm ${props.class ?? ''}`}
  >
    {props.children}
  </div>
)

/** Thin seek/progress strip under the title bar. */
export const DatasetProgressStrip: Component<{
  stats: () => DatasetNavStats
  statuses: () => ImageStatus[]
  onSeek: (index: number) => void
}> = (props) => {
  const [dragIndex, setDragIndex] = createSignal<number | null>(null)
  const position = (): { index: number; total: number } | null => props.stats().position
  const total = (): number => props.statuses().length

  /** Tick / pointer sit at the center of each image segment. */
  const tickPercent = (index: number): number => {
    const n = total()
    if (n <= 0) return 0
    return ((index + 0.5) / n) * 100
  }

  const displayIndex = (): number => {
    const dragging = dragIndex()
    if (dragging !== null) return dragging
    return position()?.index ?? 0
  }

  const positionPercent = (): number => tickPercent(displayIndex())

  const currentStatus = (): ImageStatus => props.statuses()[displayIndex()] ?? 'todo'

  const indexFromClientX = (track: HTMLElement, clientX: number): number | null => {
    const n = total()
    if (n <= 0) return null
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return null
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    return Math.min(n - 1, Math.floor(ratio * n))
  }

  const seekFromClientX = (track: HTMLElement, clientX: number): void => {
    const index = indexFromClientX(track, clientX)
    if (index === null) return
    setDragIndex(index)
    props.onSeek(index)
  }

  const endDrag = (event: PointerEvent): void => {
    const track = event.currentTarget as HTMLElement
    if (track.hasPointerCapture(event.pointerId)) {
      track.releasePointerCapture(event.pointerId)
    }
    const index = indexFromClientX(track, event.clientX)
    if (index !== null) props.onSeek(index)
    setDragIndex(null)
  }

  return (
    <div
      class="relative h-1.5 w-full shrink-0 bg-base-300"
      role="slider"
      aria-label="Dataset position"
      aria-valuemin={0}
      aria-valuemax={Math.max(total() - 1, 0)}
      aria-valuenow={displayIndex()}
      title={total() > 0 ? `${displayIndex() + 1} / ${total()}` : undefined}
    >
      <div class="pointer-events-none absolute inset-0 flex" aria-hidden="true">
        <For each={props.statuses()}>
          {(status) => <div class={`min-w-0 flex-1 ${statusSegmentClass(status)}`} />}
        </For>
      </div>
      <div class="pointer-events-none absolute inset-0" aria-hidden="true">
        <For each={props.statuses()}>
          {(_, index) => (
            <div
              class="absolute top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2 bg-base-content/40"
              style={{ left: `${tickPercent(index())}%` }}
            />
          )}
        </For>
      </div>
      <div
        class={`pointer-events-none absolute top-1/2 z-10 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-sm ring-2 ring-base-100 ${statusPointerClass(currentStatus())}`}
        style={{ left: `${positionPercent()}%` }}
        aria-hidden="true"
      />
      <Show when={total() > 0}>
        <div
          class="absolute inset-0 z-20 cursor-grab touch-none active:cursor-grabbing"
          role="presentation"
          onPointerDown={(event) => {
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            seekFromClientX(event.currentTarget, event.clientX)
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
            seekFromClientX(event.currentTarget, event.clientX)
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      </Show>
    </div>
  )
}

/** Floating transport + Skip/Done over the workspace. */
const DatasetNavBar: Component<{
  stats: () => DatasetNavStats
  currentStatus: () => ImageStatus
  entries: () => FileEntry[]
  projectRoot: () => string | null
  onSelectFile: (node: FileEntry) => void
  onFirst: () => void
  onStepBack: () => void
  onPrev: () => void
  onPlay: () => void
  onNext: () => void
  onStepForward: () => void
  onLast: () => void
  onClear: () => void
  onInProgress: () => void
  onSkip: () => void
  onDone: () => void
}> = (props) => {
  const position = (): { index: number; total: number } | null => props.stats().position
  const status = (): ImageStatus => props.currentStatus()

  const atStart = (): boolean => {
    const pos = position()
    return !pos || pos.index <= 0
  }

  const atEnd = (): boolean => {
    const pos = position()
    return !pos || pos.index >= pos.total - 1
  }

  return (
    <nav
      class="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3"
      aria-label="Dataset navigation"
    >
      <div class="flex max-w-full items-center gap-1.5">
        <FileSearchPopover
          entries={props.entries}
          projectRoot={props.projectRoot}
          iconSize={NAV_ICON_SIZE}
          onSelectFile={props.onSelectFile}
        />

        <FloatingChip class="gap-0 px-0.5">
          <TransportButton
            title="First image"
            label="First image"
            disabled={atStart()}
            onClick={props.onFirst}
          >
            <BsChevronBarLeft size={NAV_ICON_SIZE} aria-hidden="true" />
          </TransportButton>
          <TransportButton
            title={`Back ${DATASET_NAV_STEP} images`}
            label={`Back ${DATASET_NAV_STEP} images`}
            disabled={atStart()}
            onClick={props.onStepBack}
          >
            <BsChevronDoubleLeft size={NAV_ICON_SIZE} aria-hidden="true" />
          </TransportButton>
          <TransportButton
            title="Previous image ["
            label="Previous image"
            disabled={atStart()}
            onClick={props.onPrev}
          >
            <BsChevronLeft size={NAV_ICON_SIZE} aria-hidden="true" />
          </TransportButton>
          <TransportButton
            title="Next unfinished"
            label="Next unfinished"
            wide
            onClick={props.onPlay}
          >
            <NextUnfinishedIcon
              class="w-auto"
              style={{ height: `${NAV_ICON_SIZE}px` }}
              aria-hidden="true"
            />
          </TransportButton>
          <TransportButton
            title="Next image ]"
            label="Next image"
            disabled={atEnd()}
            onClick={props.onNext}
          >
            <BsChevronRight size={NAV_ICON_SIZE} aria-hidden="true" />
          </TransportButton>
          <TransportButton
            title={`Forward ${DATASET_NAV_STEP} images`}
            label={`Forward ${DATASET_NAV_STEP} images`}
            disabled={atEnd()}
            onClick={props.onStepForward}
          >
            <BsChevronDoubleRight size={NAV_ICON_SIZE} aria-hidden="true" />
          </TransportButton>
          <TransportButton
            title="Last image"
            label="Last image"
            disabled={atEnd()}
            onClick={props.onLast}
          >
            <BsChevronBarRight size={NAV_ICON_SIZE} aria-hidden="true" />
          </TransportButton>
        </FloatingChip>

        <FloatingChip class="gap-0 px-0.5">
          <TransportButton
            title="Clear status"
            label="Clear status"
            active={status() === 'todo'}
            class="text-base-content!"
            activeClass="bg-base-content/10 ring-1 ring-inset ring-base-content/30"
            onClick={props.onClear}
          >
            <StatusIconSlot>
              <BsCircle size={NAV_ICON_SIZE} aria-hidden="true" />
            </StatusIconSlot>
          </TransportButton>
          <TransportButton
            title="Mark in progress"
            label="In progress"
            active={status() === 'in_progress'}
            class="text-primary!"
            activeClass="bg-primary/15 ring-1 ring-inset ring-primary/40"
            onClick={props.onInProgress}
          >
            <StatusIconSlot>
              <Show
                when={status() === 'in_progress'}
                fallback={<BsClock size={NAV_ICON_SIZE} aria-hidden="true" />}
              >
                <BsClockFill size={NAV_ICON_SIZE} aria-hidden="true" />
              </Show>
            </StatusIconSlot>
          </TransportButton>
          <TransportButton
            title="Skip and go to next unfinished (Ctrl+Shift+Enter)"
            label="Skip"
            active={status() === 'skipped'}
            class="text-neutral!"
            activeClass="bg-neutral/15 ring-1 ring-inset ring-neutral/40"
            onClick={props.onSkip}
          >
            <StatusIconSlot>
              <Show
                when={status() === 'skipped'}
                fallback={<BsBan size={NAV_ICON_SIZE} aria-hidden="true" />}
              >
                <BsBanFill size={NAV_ICON_SIZE} aria-hidden="true" />
              </Show>
            </StatusIconSlot>
          </TransportButton>
          <TransportButton
            title="Mark done and go to next unfinished (Ctrl+Enter)"
            label="Done"
            active={status() === 'done'}
            class="text-green-500!"
            activeClass="bg-green-500/15 ring-1 ring-inset ring-green-500/40"
            onClick={props.onDone}
          >
            <StatusIconSlot>
              <Show
                when={status() === 'done'}
                fallback={<BsCheckCircle size={NAV_ICON_SIZE} aria-hidden="true" />}
              >
                <BsCheckCircleFill size={NAV_ICON_SIZE} aria-hidden="true" />
              </Show>
            </StatusIconSlot>
          </TransportButton>
        </FloatingChip>
      </div>
    </nav>
  )
}

export default DatasetNavBar
