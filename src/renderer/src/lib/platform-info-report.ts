import type {
  DiagnosticCheck,
  GpuFeatureStatus,
  GpuUsageInfo,
  RuntimeInfo
} from '../../../shared/runtime-diagnostics'

function section(title: string, lines: string[]): string {
  const body = lines.filter((line) => line.length > 0)
  if (body.length === 0) return ''
  return `${title}\n${'-'.repeat(title.length)}\n${body.join('\n')}\n`
}

function formatGpuUsage(gpu: GpuUsageInfo | null): string[] {
  if (!gpu) return ['(not loaded)']

  const lines: string[] = []
  if (gpu.webgpu) {
    lines.push(`WebGPU: ${gpu.webgpu.label}`)
    lines.push(`  adapter type: ${gpu.webgpu.adapterType}`)
  } else {
    lines.push('WebGPU: unavailable')
  }

  if (gpu.webgl2) {
    lines.push(`WebGL2: ${gpu.webgl2.renderer}`)
    if (gpu.webgl2.vendor && gpu.webgl2.vendor !== gpu.webgl2.renderer) {
      lines.push(`  vendor: ${gpu.webgl2.vendor}`)
    }
  } else {
    lines.push('WebGL2: unavailable')
  }

  return lines
}

function formatRuntime(info: RuntimeInfo | null): string[] {
  if (!info) return ['(not loaded)']
  return [
    `Electron: ${info.electron}`,
    `Chromium: ${info.chrome}`,
    `Node.js: ${info.node}`,
    `Platform: ${info.platform} (${info.arch})`
  ]
}

function formatGpuFeatures(
  features: GpuFeatureStatus | null,
  keys: readonly string[]
): string[] {
  if (!features) return ['(not loaded)']
  const rows = keys
    .filter((key) => features[key])
    .map((key) => `${key}: ${features[key]}`)
  return rows.length > 0 ? rows : ['(none reported)']
}

function formatChecks(checks: DiagnosticCheck[]): string[] {
  if (checks.length === 0) return ['(not loaded)']
  return checks.map(
    (check) => `[${check.status.toUpperCase()}] ${check.label} — ${check.detail}`
  )
}

export function formatPlatformInfoReport(input: {
  runtime: RuntimeInfo | null
  gpuUsage: GpuUsageInfo | null
  gpuFeatures: GpuFeatureStatus | null
  gpuFeatureKeys: readonly string[]
  checks: DiagnosticCheck[]
}): string {
  const generatedAt = new Date().toISOString()

  return [
    'Platform Info',
    `Generated: ${generatedAt}`,
    '',
    section('Runtime', formatRuntime(input.runtime)),
    section('Active GPU', formatGpuUsage(input.gpuUsage)),
    section(
      'Chromium GPU features',
      formatGpuFeatures(input.gpuFeatures, input.gpuFeatureKeys)
    ),
    section('Checks', formatChecks(input.checks))
  ]
    .filter(Boolean)
    .join('\n')
    .trimEnd()
}
