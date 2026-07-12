import type { Component } from 'solid-js'
import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { BsFileEarmark, BsFolderFill } from 'solid-icons/bs'
import type {
  YoloExportContent,
  YoloExportFormat,
  YoloExportPreview,
  YoloExportProgress,
  YoloExportResult,
  YoloExportTreeNode
} from '../../../shared/export'
import FloatingModal from './FloatingModal'

type Step = 'setup' | 'preview' | 'done'

const TREE_ICON = 14

const ExportTreeNodeView: Component<{
  node: YoloExportTreeNode
  depth?: number
}> = (props) => {
  const depth = (): number => props.depth ?? 0

  return (
    <div>
      <div
        class="flex items-center gap-1.5 py-0.5 text-[12px] leading-tight text-base-content/85"
        style={{ 'padding-left': `${depth() * 14}px` }}
      >
        <Show
          when={props.node.type === 'directory'}
          fallback={<BsFileEarmark size={TREE_ICON} class="shrink-0 opacity-45" />}
        >
          <BsFolderFill size={TREE_ICON} class="shrink-0 text-base-content/45" />
        </Show>
        <span class="truncate font-mono">{props.node.name}</span>
      </div>
      <Show when={props.node.type === 'directory' && props.node.children}>
        <For each={props.node.children}>
          {(child) => <ExportTreeNodeView node={child} depth={depth() + 1} />}
        </For>
        <Show when={(props.node.hiddenFileCount ?? 0) > 0}>
          <div
            class="py-0.5 font-mono text-[12px] text-base-content/45"
            style={{ 'padding-left': `${(depth() + 1) * 14 + TREE_ICON + 6}px` }}
          >
            … {props.node.hiddenFileCount} more files
          </div>
        </Show>
      </Show>
    </div>
  )
}

const ExportAnnotationsModal: Component<{
  open: () => boolean
  onClose: () => void
}> = (props) => {
  const [step, setStep] = createSignal<Step>('setup')
  const [format, setFormat] = createSignal<YoloExportFormat>('detection')
  const [content, setContent] = createSignal<YoloExportContent>('images_and_labels')
  const [outputDir, setOutputDir] = createSignal<string | null>(null)
  const [outputDirDisplay, setOutputDirDisplay] = createSignal('')
  const [includeClassesTxt, setIncludeClassesTxt] = createSignal(true)
  const [convertToJpeg, setConvertToJpeg] = createSignal(false)
  const [jpegQuality, setJpegQuality] = createSignal(90)
  const [busy, setBusy] = createSignal(false)
  const [exporting, setExporting] = createSignal(false)
  const [progress, setProgress] = createSignal<YoloExportProgress | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [preview, setPreview] = createSignal<YoloExportPreview | null>(null)
  const [result, setResult] = createSignal<YoloExportResult | null>(null)

  const reset = (): void => {
    setStep('setup')
    setFormat('detection')
    setContent('images_and_labels')
    setOutputDir(null)
    setOutputDirDisplay('')
    setIncludeClassesTxt(true)
    setConvertToJpeg(false)
    setJpegQuality(90)
    setBusy(false)
    setExporting(false)
    setProgress(null)
    setError(null)
    setPreview(null)
    setResult(null)
  }

  createEffect(() => {
    if (props.open()) reset()
  })

  createEffect(() => {
    if (!props.open()) return
    const unsubscribe = window.api.export.onYoloUltralyticsProgress((next) => {
      setProgress(next)
    })
    onCleanup(unsubscribe)
  })

  const buildOptions = (): {
    format: YoloExportFormat
    content: YoloExportContent
    outputDir: string
    includeClassesTxt: boolean
    convertToJpeg: boolean
    jpegQuality: number
  } | null => {
    const dir = outputDir()
    if (!dir) return null
    return {
      format: format(),
      content: content(),
      outputDir: dir,
      includeClassesTxt: includeClassesTxt(),
      convertToJpeg: content() === 'images_and_labels' && convertToJpeg(),
      jpegQuality: jpegQuality()
    }
  }

  const pickOutputDir = async (): Promise<void> => {
    const path = await window.api.files.saveFolder()
    if (!path) return
    setOutputDir(path)
    setOutputDirDisplay(await window.api.paths.formatDisplay(path))
    setError(null)
    setPreview(null)
    setResult(null)
  }

  const handlePreview = (): void => {
    const options = buildOptions()
    if (!options) {
      setError('Select an output folder first')
      return
    }

    setBusy(true)
    setError(null)
    setPreview(null)
    setResult(null)

    void window.api.export
      .yoloUltralyticsPreview(options)
      .then((nextPreview) => {
        setPreview(nextPreview)
        setStep('preview')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Preview failed')
      })
      .finally(() => setBusy(false))
  }

  const handleExport = (): void => {
    const options = buildOptions()
    if (!options) {
      setError('Select an output folder first')
      return
    }

    setBusy(true)
    setExporting(true)
    setError(null)
    setProgress({ completed: 0, total: preview()?.labelFileCount ?? 0 })

    void window.api.export
      .yoloUltralytics(options)
      .then((nextResult) => {
        setResult(nextResult)
        if (nextResult.cancelled) {
          setError(
            nextResult.exportedLabelFiles > 0
              ? `Export cancelled after ${nextResult.exportedLabelFiles} file(s). Partial output may remain in the folder.`
              : 'Export cancelled.'
          )
          return
        }
        setStep('done')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Export failed')
      })
      .finally(() => {
        setBusy(false)
        setExporting(false)
        setProgress(null)
      })
  }

  const handleCancelExport = (): void => {
    void window.api.export.cancelYoloUltralytics()
  }

  return (
    <FloatingModal
      open={props.open}
      onClose={() => {
        if (exporting()) {
          handleCancelExport()
          return
        }
        if (busy()) return
        props.onClose()
      }}
      labelledBy="export-annotations-title"
      panelClass={step() === 'preview' ? 'max-w-2xl p-6' : 'max-w-xl p-8'}
    >
      <h2 id="export-annotations-title" class="text-xl font-semibold">
        Export dataset
      </h2>

      <Show when={step() === 'setup'}>
        <p class="text-base-content/70 mt-2 text-sm">
          Export annotations in YOLO Ultralytics format (`labels/*.txt`, optional `images/`, and
          `classes.txt`). Preview the output tree before writing files.
        </p>

        <div class="mt-6 space-y-5">
          <fieldset class="space-y-2">
            <legend class="text-sm text-base-content/70">Format</legend>
            <label class="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="yolo-export-format"
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
                name="yolo-export-format"
                class="radio radio-sm"
                checked={format() === 'segmentation'}
                disabled={busy()}
                onChange={() => setFormat('segmentation')}
              />
              Segmentation (polygons)
            </label>
          </fieldset>

          <fieldset class="space-y-2">
            <legend class="text-sm text-base-content/70">Content</legend>
            <label class="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="yolo-export-content"
                class="radio radio-sm"
                checked={content() === 'images_and_labels'}
                disabled={busy()}
                onChange={() => setContent('images_and_labels')}
              />
              Images and labels
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="yolo-export-content"
                class="radio radio-sm"
                checked={content() === 'labels_only'}
                disabled={busy()}
                onChange={() => setContent('labels_only')}
              />
              Labels only
            </label>
          </fieldset>

          <div class="block text-sm text-base-content/70">
            Output folder
            <div class="mt-2 flex items-stretch gap-2">
              <button
                type="button"
                class="field-readonly min-w-0 flex-1 cursor-pointer truncate text-left hover:bg-base-200"
                disabled={busy()}
                onClick={() => void pickOutputDir()}
              >
                {outputDirDisplay() || 'No folder selected'}
              </button>
              <button
                type="button"
                class="btn h-auto min-h-0 shrink-0 px-4"
                disabled={busy()}
                onClick={() => void pickOutputDir()}
              >
                Browse…
              </button>
            </div>
          </div>

          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              checked={includeClassesTxt()}
              disabled={busy()}
              onChange={(event) => setIncludeClassesTxt(event.currentTarget.checked)}
            />
            Write classes.txt
          </label>

          <Show when={content() === 'images_and_labels'}>
            <div class="space-y-3">
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
                  checked={convertToJpeg()}
                  disabled={busy()}
                  onChange={(event) => setConvertToJpeg(event.currentTarget.checked)}
                />
                Convert images to JPEG
              </label>
              <Show when={convertToJpeg()}>
                <label class="block text-sm text-base-content/70">
                  JPEG quality ({jpegQuality()})
                  <input
                    type="range"
                    class="range range-sm mt-2 w-full"
                    min="50"
                    max="100"
                    step="10"
                    value={jpegQuality()}
                    disabled={busy()}
                    onInput={(event) => setJpegQuality(Number(event.currentTarget.value))}
                  />
                  <div class="mt-1 flex justify-between px-0.5 text-[11px] text-base-content/45">
                    <span>50</span>
                    <span>60</span>
                    <span>70</span>
                    <span>80</span>
                    <span>90</span>
                    <span>100</span>
                  </div>
                </label>
              </Show>
            </div>
          </Show>

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
            disabled={busy() || !outputDir()}
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
                Review the output file tree before writing. Nothing has been exported yet.
              </p>

              <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div class="rounded-lg border border-base-300 bg-base-200 px-3 py-2">
                  <div class="text-base-content/60 text-xs">Label files</div>
                  <div class="text-lg font-semibold">{previewValue().labelFileCount}</div>
                </div>
                <div class="rounded-lg border border-base-300 bg-base-200 px-3 py-2">
                  <div class="text-base-content/60 text-xs">Images</div>
                  <div class="text-lg font-semibold">{previewValue().imageCount}</div>
                </div>
                <div class="rounded-lg border border-base-300 bg-base-200 px-3 py-2">
                  <div class="text-base-content/60 text-xs">Shapes</div>
                  <div class="text-lg font-semibold">{previewValue().shapeCount}</div>
                </div>
                <div class="rounded-lg border border-base-300 bg-base-200 px-3 py-2">
                  <div class="text-base-content/60 text-xs">Classes</div>
                  <div class="text-lg font-semibold">{previewValue().classCount}</div>
                </div>
              </div>

              <div class="mt-4">
                <div class="mb-2 text-sm text-base-content/70">Output tree</div>
                <div class="tree-scrollbar max-h-[min(46vh,360px)] overflow-auto rounded-lg border border-base-300 bg-base-200 p-3">
                  <ExportTreeNodeView node={previewValue().tree} />
                </div>
              </div>

              <Show when={previewValue().warnings.length > 0}>
                <ul class="text-base-content/60 mt-3 max-h-20 list-disc space-y-1 overflow-y-auto pl-4 text-xs">
                  <For each={previewValue().warnings}>{(warning) => <li>{warning}</li>}</For>
                </ul>
              </Show>

              <Show when={error()}>
                <p class="mt-3 text-sm text-error">{error()}</p>
              </Show>

              <Show when={exporting() && progress()}>
                {(value) => (
                  <div class="mt-4 space-y-2">
                    <div class="flex items-center justify-between text-xs text-base-content/70">
                      <span>Exporting…</span>
                      <span class="font-mono">
                        {value().completed} / {value().total}
                      </span>
                    </div>
                    <progress
                      class="progress w-full"
                      value={value().completed}
                      max={Math.max(1, value().total)}
                    />
                  </div>
                )}
              </Show>

              <div class="mt-6 flex justify-end gap-2">
                <Show
                  when={exporting()}
                  fallback={
                    <>
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
                        disabled={busy() || previewValue().labelFileCount === 0}
                        onClick={handleExport}
                      >
                        Export
                      </button>
                    </>
                  }
                >
                  <button type="button" class="btn btn-error" onClick={handleCancelExport}>
                    Cancel export
                  </button>
                </Show>
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
                {value().cancelled ? 'Export cancelled. Wrote' : 'Exported'}{' '}
                {value().exportedLabelFiles} label file(s), {value().exportedShapes} shape(s)
                <Show when={value().exportedImages > 0}>
                  , {value().exportedImages} image(s)
                </Show>
                <Show when={value().wroteClassesTxt}>, classes.txt</Show>.
              </p>
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

export default ExportAnnotationsModal
