import type { Component } from 'solid-js'
import {
  For,
  Index,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup
} from 'solid-js'
import { BsChevronLeft, BsChevronRight } from 'solid-icons/bs'
import type {
  YoloImportFormat,
  YoloImportPreview,
  YoloImportResult,
  YoloPreviewLabel,
  YoloPreviewSample
} from '../../../shared/import'
import { SHAPE_OPACITY } from '../../../shared/annotations'
import { hexToRgba } from '../../../shared/label-color'
import { createImageViewport } from '../lib/image-viewport'
import { toLocalImageUrl } from '../lib/local-image-url'
import FloatingModal from './FloatingModal'

type Step = 'setup' | 'preview' | 'done'

function polygonPointsAttr(points: { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

const PreviewCanvas: Component<{
  sample: () => YoloPreviewSample
  labelsByClass: () => Map<number, YoloPreviewLabel>
}> = (props) => {
  let viewportEl: HTMLDivElement | undefined
  const [imageSize, setImageSize] = createSignal<{ width: number; height: number } | null>(null)
  const [dragging, setDragging] = createSignal(false)

  const viewport = createImageViewport({
    viewportRef: () => viewportEl,
    imageSize,
    isAnnotationMode: () => false
  })

  const strokeWidth = (): number => {
    const sample = props.sample()
    return Math.max(sample.width, sample.height) / 400
  }

  createEffect(() => {
    const sample = props.sample()
    const size = { width: sample.width, height: sample.height }
    setImageSize(size)
    requestAnimationFrame(() => {
      viewport.fitToViewport(size)
    })
  })

  onCleanup(() => {
    viewport.stopPan()
  })

  const startLeftPan = (event: MouseEvent): void => {
    if (event.button !== 0) {
      viewport.handleMouseDown(event)
      return
    }
    event.preventDefault()
    setDragging(true)
    let lastX = event.clientX
    let lastY = event.clientY

    const onMove = (moveEvent: MouseEvent): void => {
      const dx = moveEvent.clientX - lastX
      const dy = moveEvent.clientY - lastY
      lastX = moveEvent.clientX
      lastY = moveEvent.clientY
      viewport.setClampedPan(viewport.panX() + dx, viewport.panY() + dy)
    }

    const onUp = (): void => {
      setDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={(el) => {
        viewportEl = el
      }}
      class="relative h-[min(52vh,420px)] min-h-[280px] w-full cursor-grab select-none overflow-hidden rounded-lg bg-base-300 touch-none"
      classList={{ 'cursor-grabbing': dragging() || viewport.panning() }}
      onWheel={viewport.handleWheel}
      onMouseDown={startLeftPan}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        class="absolute top-0 left-0 origin-top-left will-change-transform"
        style={{
          width: `${props.sample().width}px`,
          height: `${props.sample().height}px`,
          transform: `translate(${viewport.panX()}px, ${viewport.panY()}px) scale(${viewport.scale()})`
        }}
      >
        <img
          src={toLocalImageUrl(props.sample().absolutePath)}
          alt={props.sample().relativePath}
          class="pointer-events-none block max-h-none max-w-none select-none"
          width={props.sample().width}
          height={props.sample().height}
          draggable={false}
          decoding="async"
        />
        <svg
          class="pointer-events-none absolute inset-0"
          width={props.sample().width}
          height={props.sample().height}
          viewBox={`0 0 ${props.sample().width} ${props.sample().height}`}
        >
          <For each={props.sample().shapes}>
            {(shape) => {
              const color = (): string =>
                props.labelsByClass().get(shape.classId)?.color ?? '#ff004d'
              return (
                <Switch>
                  <Match when={shape.type === 'rectangle' ? shape : false}>
                    {(rect) => (
                      <rect
                        x={rect().x}
                        y={rect().y}
                        width={rect().width}
                        height={rect().height}
                        fill={hexToRgba(color(), SHAPE_OPACITY)}
                        stroke={color()}
                        stroke-width={strokeWidth()}
                      />
                    )}
                  </Match>
                  <Match when={shape.type === 'polygon' ? shape : false}>
                    {(polygon) => (
                      <polygon
                        points={polygonPointsAttr(polygon().points)}
                        fill={hexToRgba(color(), SHAPE_OPACITY)}
                        stroke={color()}
                        stroke-width={strokeWidth()}
                      />
                    )}
                  </Match>
                </Switch>
              )
            }}
          </For>
        </svg>
      </div>
    </div>
  )
}

const ImportAnnotationsModal: Component<{
  open: () => boolean
  onClose: () => void
  onImported: (result: YoloImportResult) => void | Promise<void>
}> = (props) => {
  const [step, setStep] = createSignal<Step>('setup')
  const [format, setFormat] = createSignal<YoloImportFormat>('detection')
  const [labelsDir, setLabelsDir] = createSignal<string | null>(null)
  const [labelsDirDisplay, setLabelsDirDisplay] = createSignal('')
  const [classesPath, setClassesPath] = createSignal<string | null>(null)
  const [classesPathDisplay, setClassesPathDisplay] = createSignal('')
  const [replaceExisting, setReplaceExisting] = createSignal(true)
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [preview, setPreview] = createSignal<YoloImportPreview | null>(null)
  const [result, setResult] = createSignal<YoloImportResult | null>(null)
  const [sampleIndex, setSampleIndex] = createSignal(0)
  const [existingLabelNames, setExistingLabelNames] = createSignal(new Set<string>())
  const [labelNameEdits, setLabelNameEdits] = createSignal<Record<number, string>>({})

  const reset = (): void => {
    setStep('setup')
    setFormat('detection')
    setLabelsDir(null)
    setLabelsDirDisplay('')
    setClassesPath(null)
    setClassesPathDisplay('')
    setReplaceExisting(true)
    setBusy(false)
    setError(null)
    setPreview(null)
    setResult(null)
    setSampleIndex(0)
    setExistingLabelNames(new Set<string>())
    setLabelNameEdits({})
  }

  createEffect(() => {
    if (props.open()) reset()
  })

  const labelsByClass = createMemo(() => {
    const map = new Map<number, YoloPreviewLabel>()
    for (const label of preview()?.labels ?? []) {
      const name = labelNameEdits()[label.classId] ?? label.name
      map.set(label.classId, {
        ...label,
        name,
        isNew: !existingLabelNames().has(name.trim().toLowerCase())
      })
    }
    return map
  })

  const currentSample = createMemo((): YoloPreviewSample | null => {
    const samples = preview()?.samples ?? []
    return samples[sampleIndex()] ?? null
  })

  const newLabelCount = createMemo(() => {
    const labels = preview()?.labels ?? []
    const edits = labelNameEdits()
    const existing = existingLabelNames()
    return labels.filter((label) => {
      const name = (edits[label.classId] ?? label.name).trim().toLowerCase()
      return !existing.has(name)
    }).length
  })

  const labelDisplayName = (classId: number, fallback: string): string =>
    labelNameEdits()[classId] ?? fallback

  const labelIsNew = (classId: number, fallback: string): boolean => {
    const name = labelDisplayName(classId, fallback).trim().toLowerCase()
    return !existingLabelNames().has(name)
  }

  const options = (): {
    format: YoloImportFormat
    labelsDir: string
    classesPath: string | null
    replaceExisting: boolean
  } | null => {
    const dir = labelsDir()
    if (!dir) return null
    return {
      format: format(),
      labelsDir: dir,
      classesPath: classesPath(),
      replaceExisting: replaceExisting()
    }
  }

  const pickLabelsDir = async (): Promise<void> => {
    const path = await window.api.files.openFolder()
    if (!path) return
    setLabelsDir(path)
    setLabelsDirDisplay(await window.api.paths.formatDisplay(path))
    setError(null)
    setPreview(null)
    setResult(null)
  }

  const pickClassesFile = async (): Promise<void> => {
    const path = await window.api.files.openFile([
      { name: 'Class names', extensions: ['txt', 'yaml', 'yml'] },
      { name: 'All Files', extensions: ['*'] }
    ])
    if (!path) return
    setClassesPath(path)
    setClassesPathDisplay(await window.api.paths.formatDisplay(path))
    setError(null)
    setPreview(null)
    setResult(null)
  }

  const clearClassesFile = (): void => {
    setClassesPath(null)
    setClassesPathDisplay('')
  }

  const renameLabel = (classId: number, name: string): void => {
    setLabelNameEdits((current) => ({ ...current, [classId]: name }))
  }

  const handlePreview = (): void => {
    const nextOptions = options()
    if (!nextOptions) {
      setError('Select a labels folder first')
      return
    }

    setBusy(true)
    setError(null)
    setPreview(null)
    setResult(null)

    void Promise.all([window.api.import.yoloUltralyticsPreview(nextOptions), window.api.labels.list()])
      .then(([nextPreview, projectLabels]) => {
        setExistingLabelNames(new Set(projectLabels.map((label) => label.name.toLowerCase())))
        setLabelNameEdits({})
        setPreview(nextPreview)
        setSampleIndex(0)
        setStep('preview')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Preview failed')
      })
      .finally(() => setBusy(false))
  }

  const handleImport = (): void => {
    const nextOptions = options()
    const currentPreview = preview()
    if (!nextOptions || !currentPreview) {
      setError('Select a labels folder first')
      return
    }

    const labelNames: Record<number, string> = {}
    for (const label of currentPreview.labels) {
      const edited = labelNameEdits()[label.classId]
      labelNames[label.classId] = (edited ?? label.name).trim() || label.name
    }

    setBusy(true)
    setError(null)

    void window.api.import
      .yoloUltralytics({ ...nextOptions, labelNames })
      .then(async (nextResult) => {
        setResult(nextResult)
        setStep('done')
        await props.onImported(nextResult)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Import failed')
      })
      .finally(() => setBusy(false))
  }

  return (
    <FloatingModal
      open={props.open}
      onClose={() => {
        if (busy()) return
        props.onClose()
      }}
      labelledBy="import-annotations-title"
      panelClass={step() === 'preview' ? 'max-w-5xl p-6' : 'max-w-xl p-8'}
    >
      <h2 id="import-annotations-title" class="text-xl font-semibold">
        Import annotations
      </h2>

      <Show when={step() === 'setup'}>
        <p class="text-base-content/70 mt-2 text-sm">
          Import YOLO Ultralytics label files (`.txt`) and match them to images in the open project by
          filename. Preview before writing to the database.
        </p>

        <div class="mt-6 space-y-5">
          <fieldset class="space-y-2">
            <legend class="text-sm text-base-content/70">Format</legend>
            <label class="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="yolo-import-format"
                class="radio radio-sm"
                checked={format() === 'detection'}
                disabled={busy()}
                onChange={() => setFormat('detection')}
              />
              Detection (bounding boxes)
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="yolo-import-format"
                class="radio radio-sm"
                checked={format() === 'segmentation'}
                disabled={busy()}
                onChange={() => setFormat('segmentation')}
              />
              Segmentation (polygons)
            </label>
          </fieldset>

          <div class="block text-sm text-base-content/70">
            Labels folder
            <div class="mt-2 flex items-stretch gap-2">
              <button
                type="button"
                class="field-readonly min-w-0 flex-1 cursor-pointer truncate text-left hover:bg-base-200"
                disabled={busy()}
                onClick={() => void pickLabelsDir()}
              >
                {labelsDirDisplay() || 'No folder selected'}
              </button>
              <button
                type="button"
                class="btn h-auto min-h-0 shrink-0 px-4"
                disabled={busy()}
                onClick={() => void pickLabelsDir()}
              >
                Browse…
              </button>
            </div>
          </div>

          <div class="block text-sm text-base-content/70">
            Class names <span class="opacity-60">(optional)</span>
            <div class="mt-2 flex items-stretch gap-2">
              <button
                type="button"
                class="field-readonly min-w-0 flex-1 cursor-pointer truncate text-left hover:bg-base-200"
                disabled={busy()}
                onClick={() => void pickClassesFile()}
              >
                {classesPathDisplay() || 'classes.txt / data.yaml'}
              </button>
              <Show when={classesPath()}>
                <button
                  type="button"
                  class="btn btn-ghost h-auto min-h-0 shrink-0 px-3"
                  disabled={busy()}
                  onClick={clearClassesFile}
                >
                  Clear
                </button>
              </Show>
              <button
                type="button"
                class="btn h-auto min-h-0 shrink-0 px-4"
                disabled={busy()}
                onClick={() => void pickClassesFile()}
              >
                Browse…
              </button>
            </div>
          </div>

          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              checked={replaceExisting()}
              disabled={busy()}
              onChange={(event) => setReplaceExisting(event.currentTarget.checked)}
            />
            Replace existing annotations on matched images
          </label>

          <Show when={error()}>
            <p class="text-sm text-error">{error()}</p>
          </Show>
        </div>

        <div class="mt-8 flex justify-end gap-2">
          <button type="button" class="btn btn-ghost" disabled={busy()} onClick={() => props.onClose()}>
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            disabled={busy() || !labelsDir()}
            onClick={handlePreview}
          >
            <Show when={busy()} fallback="Preview">
              <span class="loading loading-spinner loading-sm" />
              Scanning…
            </Show>
          </button>
        </div>
      </Show>

      <Show when={step() === 'preview' && preview() !== null}>
        <Show when={preview()}>
          {(previewValue) => (
          <>
            <p class="text-base-content/70 mt-2 text-sm">
              Review matched annotations before importing. Nothing has been written yet.
            </p>

            <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div class="rounded-lg border border-base-300 bg-base-200 px-3 py-2">
                <div class="text-base-content/60 text-xs">Matched images</div>
                <div class="text-lg font-semibold">{previewValue().matchedImages}</div>
              </div>
              <div class="rounded-lg border border-base-300 bg-base-200 px-3 py-2">
                <div class="text-base-content/60 text-xs">Shapes</div>
                <div class="text-lg font-semibold">{previewValue().totalShapes}</div>
              </div>
              <div class="rounded-lg border border-base-300 bg-base-200 px-3 py-2">
                <div class="text-base-content/60 text-xs">Labels</div>
                <div class="text-lg font-semibold">{previewValue().labels.length}</div>
              </div>
              <div class="rounded-lg border border-base-300 bg-base-200 px-3 py-2">
                <div class="text-base-content/60 text-xs">New labels</div>
                <div class="text-lg font-semibold">{newLabelCount()}</div>
              </div>
            </div>

            <Show when={previewValue().missingImages > 0 || previewValue().skippedLabelFiles > 0}>
              <p class="text-base-content/70 mt-2 text-sm">
                <Show when={previewValue().missingImages > 0}>
                  {previewValue().missingImages} label file(s) had no matching project image.
                </Show>{' '}
                <Show when={previewValue().skippedLabelFiles > 0}>
                  {previewValue().skippedLabelFiles} file(s) skipped (unreadable image size).
                </Show>
              </p>
            </Show>

            <div class="mt-4">
              <div class="mb-2 text-sm text-base-content/70">Labels</div>
              <div class="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                <Index each={previewValue().labels}>
                  {(label) => (
                    <span class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-base-200 px-2 py-1">
                      <span
                        class="inline-block size-2.5 shrink-0 rounded-sm"
                        style={{ 'background-color': label().color }}
                      />
                      <input
                        type="text"
                        class="input input-xs input-bordered h-6 w-[9rem] max-w-[9rem] cursor-text select-text bg-base-100 px-2 text-sm leading-none"
                        value={labelDisplayName(label().classId, label().name)}
                        disabled={busy()}
                        title="Click to rename"
                        aria-label={`Rename class ${label().classId}`}
                        onInput={(event) => renameLabel(label().classId, event.currentTarget.value)}
                        onMouseDown={(event) => event.stopPropagation()}
                      />
                      <span class="text-xs opacity-50">{label().shapeCount}</span>
                      <Show when={labelIsNew(label().classId, label().name)}>
                        <span class="text-xs text-success opacity-80">new</span>
                      </Show>
                    </span>
                  )}
                </Index>
                <Show when={previewValue().labels.length === 0}>
                  <span class="text-base-content/50 text-sm">No labels found in label files.</span>
                </Show>
              </div>
            </div>

            <div class="mt-4 flex flex-col gap-3">
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0 text-sm text-base-content/70">
                  <Show
                    when={currentSample()}
                    fallback={<span>No annotated samples to preview</span>}
                  >
                    {(sample) => (
                      <span class="truncate" title={sample().relativePath}>
                        {sample().relativePath}
                        <span class="opacity-50">
                          {' '}
                          · {sample().shapes.length} shape(s) · {sampleIndex() + 1}/
                          {previewValue().samples.length}
                          {' '}
                          · scroll to zoom, drag to pan
                        </span>
                      </span>
                    )}
                  </Show>
                </div>
                <div class="flex shrink-0 gap-1">
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm btn-square"
                    disabled={busy() || sampleIndex() <= 0}
                    aria-label="Previous sample"
                    onClick={() => setSampleIndex((index) => Math.max(0, index - 1))}
                  >
                    <BsChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm btn-square"
                    disabled={
                      busy() || sampleIndex() >= Math.max(0, previewValue().samples.length - 1)
                    }
                    aria-label="Next sample"
                    onClick={() =>
                      setSampleIndex((index) =>
                        Math.min(previewValue().samples.length - 1, index + 1)
                      )
                    }
                  >
                    <BsChevronRight size={14} />
                  </button>
                </div>
              </div>

              <Show when={currentSample()}>
                {(sample) => <PreviewCanvas sample={sample} labelsByClass={labelsByClass} />}
              </Show>
            </div>

            <Show when={previewValue().warnings.length > 0}>
              <ul class="text-base-content/60 mt-3 max-h-20 list-disc space-y-1 overflow-y-auto pl-4 text-xs">
                <For each={previewValue().warnings}>{(warning) => <li>{warning}</li>}</For>
              </ul>
            </Show>

            <Show when={error()}>
              <p class="mt-3 text-sm text-error">{error()}</p>
            </Show>

            <div class="mt-6 flex justify-end gap-2">
              <button
                type="button"
                class="btn btn-ghost"
                disabled={busy()}
                onClick={() => {
                  setStep('setup')
                  setError(null)
                }}
              >
                Back
              </button>
              <button
                type="button"
                class="btn btn-primary"
                disabled={busy() || previewValue().matchedImages === 0}
                onClick={handleImport}
              >
                <Show when={busy()} fallback="Import">
                  <span class="loading loading-spinner loading-sm" />
                  Importing…
                </Show>
              </button>
            </div>
          </>
          )}
        </Show>
      </Show>

      <Show when={step() === 'done' && result()}>
        {(value) => (
          <>
            <div class="mt-6 rounded-lg border border-base-300 bg-base-200 p-3 text-sm">
              <p>
                Matched {value().matchedImages} image(s), imported {value().importedShapes}{' '}
                shape(s), created {value().createdLabels} label(s).
              </p>
              <Show when={value().missingImages > 0}>
                <p class="text-base-content/70 mt-1">
                  {value().missingImages} label file(s) had no matching project image.
                </p>
              </Show>
              <Show when={value().warnings.length > 0}>
                <ul class="text-base-content/70 mt-2 list-disc space-y-1 pl-4">
                  <For each={value().warnings}>{(warning) => <li>{warning}</li>}</For>
                </ul>
              </Show>
            </div>
            <div class="mt-8 flex justify-end">
              <button type="button" class="btn btn-primary" onClick={() => props.onClose()}>
                Close
              </button>
            </div>
          </>
        )}
      </Show>
    </FloatingModal>
  )
}

export default ImportAnnotationsModal
