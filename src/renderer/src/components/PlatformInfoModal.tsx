import type { Component } from 'solid-js'
import { For, Show, createEffect, createSignal, on, createUniqueId } from 'solid-js'
import type {
  DiagnosticCheck,
  DiagnosticStatus,
  GpuFeatureStatus,
  GpuUsageInfo,
  RuntimeInfo
} from '../../../shared/runtime-diagnostics'
import { runWebGpuDiagnostics } from '../lib/webgpu-diagnostics'
import { formatPlatformInfoReport } from '../lib/platform-info-report'
import FloatingModal from './FloatingModal'

const statusBadgeClass: Record<DiagnosticStatus, string> = {
  pass: 'badge-success',
  fail: 'badge-error',
  warn: 'badge-warning',
  info: 'badge-info',
  pending: 'badge-ghost'
}

const statusLabel: Record<DiagnosticStatus, string> = {
  pass: 'Pass',
  fail: 'Fail',
  warn: 'Warn',
  info: 'Info',
  pending: '…'
}

const GPU_STATUS_KEYS = [
  'webgpu',
  'webgl',
  'webgl2',
  '2d_canvas',
  'gpu_compositing',
  'rasterization',
  'video_decode',
  'video_encode'
] as const

const PlatformInfoModal: Component<{
  open: () => boolean
  onClose: () => void
}> = (props) => {
  const titleId = createUniqueId()
  const [runtime, setRuntime] = createSignal<RuntimeInfo | null>(null)
  const [gpuStatus, setGpuStatus] = createSignal<GpuFeatureStatus | null>(null)
  const [gpuUsage, setGpuUsage] = createSignal<GpuUsageInfo | null>(null)
  const [checks, setChecks] = createSignal<DiagnosticCheck[]>([])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [copyState, setCopyState] = createSignal<'idle' | 'copied' | 'failed'>('idle')

  const hasReportData = (): boolean =>
    runtime() !== null || gpuUsage() !== null || checks().length > 0

  const copyReport = async (): Promise<void> => {
    if (!hasReportData()) return

    const text = formatPlatformInfoReport({
      runtime: runtime(),
      gpuUsage: gpuUsage(),
      gpuFeatures: gpuStatus(),
      gpuFeatureKeys: GPU_STATUS_KEYS,
      checks: checks()
    })

    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setCopyState('failed')
      window.setTimeout(() => setCopyState('idle'), 2000)
    }
  }

  const refresh = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const [info, features, diagnostics] = await Promise.all([
        window.api.runtime.getInfo(),
        window.api.gpu.getFeatureStatus(),
        runWebGpuDiagnostics()
      ])
      setRuntime(info)
      setGpuStatus(features)
      setGpuUsage(diagnostics.gpu)
      setChecks(diagnostics.checks)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  createEffect(
    on(
      () => props.open(),
      (open) => {
        if (!open) {
          setRuntime(null)
          setGpuStatus(null)
          setGpuUsage(null)
          setChecks([])
          setError(null)
          setCopyState('idle')
          return
        }
        void refresh()
      }
    )
  )

  const gpuRows = (): { key: string; value: string }[] => {
    const features = gpuStatus()
    if (!features) return []
    return GPU_STATUS_KEYS.filter((key) => features[key]).map((key) => ({
      key,
      value: features[key]!
    }))
  }

  return (
    <FloatingModal
      open={props.open}
      onClose={props.onClose}
      labelledBy={titleId}
      panelClass="max-w-2xl p-0"
    >
      <div class="flex items-start justify-between gap-3 border-b border-base-content/10 px-5 py-4">
        <div>
          <h2 id={titleId} class="text-base font-semibold">
            Platform Info
          </h2>
          <p class="text-base-content/60 mt-1 text-sm">
            Runtime versions, GPU status, and platform checks.
          </p>
        </div>
        <div class="flex shrink-0 gap-1">
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            disabled={loading() || !hasReportData()}
            onClick={() => void copyReport()}
          >
            {copyState() === 'copied'
              ? 'Copied'
              : copyState() === 'failed'
                ? 'Copy failed'
                : 'Copy report'}
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            disabled={loading()}
            onClick={() => void refresh()}
          >
            {loading() ? <span class="loading loading-spinner loading-xs" /> : 'Refresh'}
          </button>
        </div>
      </div>

      <div class="max-h-[min(70vh,640px)] overflow-y-auto px-5 py-4">
        <Show when={error()}>
          <div class="alert alert-error mb-4 text-sm">{error()}</div>
        </Show>

        <section class="mb-5">
          <h3 class="text-base-content/60 mb-2 text-xs font-semibold tracking-wide uppercase">
            Active GPU
          </h3>
          <Show
            when={gpuUsage()}
            fallback={
              <div class="skeleton h-16 w-full rounded-lg" />
            }
          >
            {(usage) => (
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt class="text-base-content/60">WebGPU</dt>
                <dd>
                  <Show
                    when={usage().webgpu}
                    fallback={<span class="text-base-content/50">Unavailable</span>}
                  >
                    {(webgpu) => (
                      <div>
                        <div class="font-medium">{webgpu().label}</div>
                        <div class="text-base-content/60 mt-0.5 text-xs">
                          {webgpu().adapterType} adapter
                        </div>
                      </div>
                    )}
                  </Show>
                </dd>
                <dt class="text-base-content/60">WebGL2</dt>
                <dd>
                  <Show
                    when={usage().webgl2}
                    fallback={<span class="text-base-content/50">Unavailable</span>}
                  >
                    {(webgl2) => (
                      <div>
                        <div class="font-medium">{webgl2().renderer}</div>
                        <Show when={webgl2().vendor && webgl2().vendor !== webgl2().renderer}>
                          <div class="text-base-content/60 mt-0.5 text-xs">{webgl2().vendor}</div>
                        </Show>
                      </div>
                    )}
                  </Show>
                </dd>
              </dl>
            )}
          </Show>
        </section>

        <section class="mb-5">
          <h3 class="text-base-content/60 mb-2 text-xs font-semibold tracking-wide uppercase">
            Runtime
          </h3>
          <Show
            when={runtime()}
            fallback={
              <div class="skeleton h-20 w-full rounded-lg" />
            }
          >
            {(info) => (
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt class="text-base-content/60">Electron</dt>
                <dd>{info().electron}</dd>
                <dt class="text-base-content/60">Chromium</dt>
                <dd>{info().chrome}</dd>
                <dt class="text-base-content/60">Node.js</dt>
                <dd>{info().node}</dd>
                <dt class="text-base-content/60">Platform</dt>
                <dd>
                  {info().platform} ({info().arch})
                </dd>
              </dl>
            )}
          </Show>
        </section>

        <section class="mb-5">
          <h3 class="text-base-content/60 mb-2 text-xs font-semibold tracking-wide uppercase">
            Chromium GPU features
          </h3>
          <Show
            when={gpuRows().length > 0}
            fallback={
              <div class="skeleton h-24 w-full rounded-lg" />
            }
          >
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <For each={gpuRows()}>
                {(row) => (
                  <div class="contents">
                    <dt class="text-base-content/60">{row.key}</dt>
                    <dd>{row.value}</dd>
                  </div>
                )}
              </For>
            </dl>
          </Show>
        </section>

        <section>
          <h3 class="text-base-content/60 mb-2 text-xs font-semibold tracking-wide uppercase">
            Checks
          </h3>
          <Show
            when={checks().length > 0}
            fallback={
              <div class="skeleton h-32 w-full rounded-lg" />
            }
          >
            <ul class="divide-y divide-base-content/10 rounded-lg border border-base-content/10">
              <For each={checks()}>
                {(item) => (
                  <li class="flex items-start gap-3 px-3 py-2.5">
                    <span
                      class={`badge badge-sm shrink-0 ${statusBadgeClass[item.status]}`}
                    >
                      {statusLabel[item.status]}
                    </span>
                    <div class="min-w-0">
                      <div class="text-sm font-medium">{item.label}</div>
                      <div class="text-base-content/60 mt-0.5 text-xs break-words">
                        {item.detail}
                      </div>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      </div>

      <div class="flex items-center justify-between gap-3 border-t border-base-content/10 px-5 py-4">
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onClick={() => void window.api.gpu.openChromeGpu()}
          >
            Open chrome://gpu
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onClick={() =>
              void window.api.shell.openInApp('https://webgpureport.org/', 'Platform Info')
            }
          >
            Open webgpureport.org
          </button>
        </div>
        <button type="button" class="btn btn-primary btn-sm" onClick={props.onClose}>
          Close
        </button>
      </div>
    </FloatingModal>
  )
}

export default PlatformInfoModal
