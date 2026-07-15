import type { Component } from 'solid-js'
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { BsCheckCircleFill, BsDownload } from 'solid-icons/bs'
import { MODEL_FAMILIES, MODEL_REGISTRY, formatBytes, getModelById } from '../lib/sam/models'
import { samPipeline } from '../lib/sam/sam-pipeline'

const MagicStickSettings: Component = () => {
  const [busyDownloadId, setBusyDownloadId] = createSignal<string | null>(null)
  const [busyUnload, setBusyUnload] = createSignal(false)

  onMount(() => {
    void samPipeline.probeWebGpu()
    void samPipeline.refreshCacheStatus().then(() => {
      const current = samPipeline.selectedModelId()
      if (!samPipeline.modelCached()[current]) {
        samPipeline.setSelectedModelId(samPipeline.defaultModelId())
      }
    })
  })

  createEffect(() => {
    const modelId = samPipeline.selectedModelId()
    const cached = samPipeline.modelCached()[modelId]
    if (cached) {
      void samPipeline.ensureModelLoaded(modelId)
    }
  })

  onCleanup(() => {
    // keep worker alive across tool switches within session
  })

  const selectedModel = createMemo(() => getModelById(samPipeline.selectedModelId()))
  const modelInMemory = createMemo(
    () => samPipeline.loadedModelId() === samPipeline.selectedModelId()
  )
  const progress = (): number => {
    const p = samPipeline.downloadProgress()
    if (!p || p.total <= 0) return 0
    return Math.min(100, Math.round((p.received / p.total) * 100))
  }

  const webgpuLabel = createMemo(() => {
    const v = samPipeline.webgpuAvailable()
    if (v === null) return 'Checking…'
    return v ? 'Available' : 'Unavailable'
  })

  const statusLabel = createMemo(() => {
    const modelId = samPipeline.selectedModelId()
    if (!samPipeline.modelCached()[modelId]) return 'Not loaded'

    const s = samPipeline.pipelineStatus()
    if (s === 'loading-model') return 'Loading model…'
    if (s === 'encoding') return 'Encoding image…'
    if (s === 'decoding') return 'Segmenting…'
    if (s === 'ready') {
      const decodeMs = samPipeline.lastDecodeMs()
      if (decodeMs !== null) return `Segmented in ${decodeMs}ms`
      const encodeMs = samPipeline.lastEncodeMs()
      if (encodeMs !== null) return `Image encoded in ${encodeMs}ms`
      return samPipeline.embeddingReady() ? 'Ready' : 'Model ready'
    }
    if (s === 'error') {
      const phase = samPipeline.pipelineErrorPhase()
      if (phase === 'encode') return 'Encoding failed'
      if (phase === 'decode') return 'Segmenting failed'
      return 'Load failed'
    }
    if (s === 'idle') return modelInMemory() ? 'Select a model' : 'Unloaded'
    return 'Select a model'
  })

  const statusError = createMemo(() => {
    if (samPipeline.pipelineStatus() !== 'error') return null
    return samPipeline.pipelineError()
  })

  const handleDownload = async (modelId: string, event: MouseEvent): Promise<void> => {
    event.preventDefault()
    event.stopPropagation()
    if (busyDownloadId()) return
    setBusyDownloadId(modelId)
    try {
      await samPipeline.downloadModel(modelId)
      if (samPipeline.selectedModelId() === modelId) {
        await samPipeline.ensureModelLoaded(modelId)
      }
    } finally {
      setBusyDownloadId(null)
    }
  }

  const handleUnload = async (): Promise<void> => {
    if (busyUnload()) return
    setBusyUnload(true)
    try {
      await samPipeline.unloadModel()
    } finally {
      setBusyUnload(false)
    }
  }

  const handleLoad = async (): Promise<void> => {
    await samPipeline.ensureModelLoaded(samPipeline.selectedModelId())
  }

  return (
    <section class="shrink-0 border-b border-base-content/10">
      <div class="px-3 pt-2.5 pb-2 text-[11px] font-semibold tracking-wide text-base-content/60">
        MAGIC STICK
      </div>
      <div class="flex flex-col gap-2.5 px-3 pb-3">
        <div class="flex items-center justify-between gap-2 text-xs">
          <span class="text-base-content/70">WebGPU</span>
          <span
            class="badge badge-sm"
            classList={{
              'badge-success': samPipeline.webgpuAvailable() === true,
              'badge-error': samPipeline.webgpuAvailable() === false,
              'badge-ghost': samPipeline.webgpuAvailable() === null
            }}
          >
            {webgpuLabel()}
          </span>
        </div>

        <label class="flex flex-col gap-1 text-xs">
          <span class="text-base-content/70">Model</span>
          <select
            class="select select-bordered select-sm w-full"
            value={samPipeline.selectedModelId()}
            onChange={(event) => {
              samPipeline.setSelectedModelId(event.currentTarget.value)
              samPipeline.clearPrompts()
              samPipeline.invalidateEmbedding()
            }}
          >
            <For each={MODEL_FAMILIES}>
              {(family) => {
                const models = MODEL_REGISTRY.filter((m) =>
                  (family.families as readonly string[]).includes(m.family)
                )
                const backend = models.every((m) => m.requiresWebGPU)
                  ? 'WebGPU'
                  : models.every((m) => !m.requiresWebGPU)
                    ? 'CPU (WASM)'
                    : 'mixed'
                return (
                  <optgroup label={`${family.label} — ${backend}`}>
                    <For each={models}>
                      {(model) => {
                        const disabled = (): boolean =>
                          model.requiresWebGPU && samPipeline.webgpuAvailable() === false
                        return (
                          <option value={model.id} disabled={disabled()}>
                            {model.name} ({formatBytes(model.totalSize)})
                            {disabled() ? ' — needs WebGPU' : ''}
                          </option>
                        )
                      }}
                    </For>
                  </optgroup>
                )
              }}
            </For>
          </select>
        </label>

        <Show when={selectedModel()}>
          {(model) => {
            const cached = (): boolean => !!samPipeline.modelCached()[model().id]
            const downloading = (): boolean =>
              busyDownloadId() === model().id ||
              (samPipeline.downloadProgress()?.id === model().id &&
                (samPipeline.downloadProgress()?.stage === 'downloading' ||
                  samPipeline.downloadProgress()?.stage === 'extracting'))
            const loading = (): boolean => samPipeline.pipelineStatus() === 'loading-model'
            return (
              <div class="flex flex-col gap-1.5">
                <div class="flex items-start justify-between gap-2">
                  <span class="min-w-0 text-xs text-base-content/60">
                    {model().description}
                  </span>
                  <Show
                    when={cached()}
                    fallback={
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        title="Download model"
                        disabled={downloading()}
                        onClick={(event) => void handleDownload(model().id, event)}
                      >
                        <BsDownload size={14} />
                      </button>
                    }
                  >
                    <span class="text-success shrink-0" title="Downloaded">
                      <BsCheckCircleFill size={14} />
                    </span>
                  </Show>
                </div>
                <Show when={downloading()}>
                  <progress
                    class="progress progress-primary h-1.5 w-full"
                    value={progress()}
                    max={100}
                  />
                  <span class="text-[10px] text-base-content/50">{progress()}%</span>
                </Show>
                <Show when={cached()}>
                  <div class="flex gap-1">
                    <Show
                      when={modelInMemory()}
                      fallback={
                        <button
                          type="button"
                          class="btn btn-xs"
                          disabled={loading() || busyUnload()}
                          onClick={() => void handleLoad()}
                        >
                          Load
                        </button>
                      }
                    >
                      <button
                        type="button"
                        class="btn btn-xs"
                        disabled={busyUnload() || loading()}
                        onClick={() => void handleUnload()}
                      >
                        {busyUnload() ? 'Unloading…' : 'Unload'}
                      </button>
                    </Show>
                  </div>
                </Show>
              </div>
            )
          }}
        </Show>

        <div class="text-[11px] text-base-content/50">{statusLabel()}</div>
        <Show when={statusError()}>
          {(message) => (
            <p class="text-error m-0 text-[11px] leading-snug wrap-break-word" title={message()}>
              {message()}
            </p>
          )}
        </Show>
      </div>
    </section>
  )
}

export default MagicStickSettings
