export type DiagnosticStatus = 'pass' | 'fail' | 'warn' | 'info' | 'pending'

export type DiagnosticCheck = {
  id: string
  label: string
  status: DiagnosticStatus
  detail: string
}

export type RuntimeInfo = {
  electron: string
  chrome: string
  node: string
  platform: NodeJS.Platform
  arch: string
}

export type GpuFeatureStatus = Record<string, string>

export type GpuUsageInfo = {
  webgpu: {
    vendor: string
    architecture: string
    device: string
    description: string
    adapterType: string
    label: string
  } | null
  webgl2: {
    vendor: string
    renderer: string
  } | null
}

export type WebGpuDiagnosticsResult = {
  checks: DiagnosticCheck[]
  gpu: GpuUsageInfo
}
