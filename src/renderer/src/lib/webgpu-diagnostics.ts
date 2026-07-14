import type { DiagnosticCheck, GpuUsageInfo, WebGpuDiagnosticsResult } from '../../../shared/runtime-diagnostics'

function check(
  id: string,
  label: string,
  status: DiagnosticCheck['status'],
  detail: string
): DiagnosticCheck {
  return { id, label, status, detail }
}

function formatWebGpuAdapterLabel(info: {
  vendor: string
  architecture: string
  device: string
  description: string
}): string {
  return [info.vendor, info.architecture, info.device, info.description]
    .filter(Boolean)
    .join(' · ')
}

function readWebGl2Usage(): GpuUsageInfo['webgl2'] {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2')
  if (!gl) return null

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
  if (debugInfo) {
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    if (typeof vendor === 'string' && typeof renderer === 'string') {
      return { vendor, renderer }
    }
  }

  const vendor = gl.getParameter(gl.VENDOR)
  const renderer = gl.getParameter(gl.RENDERER)
  if (typeof vendor !== 'string' || typeof renderer !== 'string') return null
  return { vendor, renderer }
}

export async function runWebGpuDiagnostics(): Promise<WebGpuDiagnosticsResult> {
  const checks: DiagnosticCheck[] = []
  const gpu: GpuUsageInfo = { webgpu: null, webgl2: null }

  checks.push(
    check(
      'secure-context',
      'Secure context',
      window.isSecureContext ? 'pass' : 'fail',
      window.isSecureContext ? 'Yes' : 'WebGPU requires a secure context'
    )
  )

  const gpuApi = navigator.gpu
  if (!gpuApi) {
    checks.push(
      check(
        'api',
        'WebGPU API',
        'fail',
        'navigator.gpu is unavailable (enable WebGPU flags in the main process)'
      )
    )
    gpu.webgl2 = readWebGl2Usage()
    checks.push(...buildWebGlChecks(gpu.webgl2))
    return { checks, gpu }
  }

  checks.push(check('api', 'WebGPU API', 'pass', 'navigator.gpu is available'))

  let adapter: Awaited<ReturnType<NonNullable<Navigator['gpu']>['requestAdapter']>>
  try {
    adapter = await gpuApi.requestAdapter()
  } catch (error) {
    checks.push(check('adapter', 'requestAdapter()', 'fail', String(error)))
    gpu.webgl2 = readWebGl2Usage()
    checks.push(...buildWebGlChecks(gpu.webgl2))
    return { checks, gpu }
  }

  if (!adapter) {
    checks.push(
      check(
        'adapter',
        'requestAdapter()',
        'fail',
        'Returned null — GPU may be blocklisted or drivers unavailable'
      )
    )
    gpu.webgl2 = readWebGl2Usage()
    checks.push(...buildWebGlChecks(gpu.webgl2))
    return { checks, gpu }
  }

  const info = adapter.info
  const adapterLabel = formatWebGpuAdapterLabel(info)
  gpu.webgpu = {
    vendor: info.vendor,
    architecture: info.architecture,
    device: info.device,
    description: info.description,
    adapterType: info.adapterType ?? 'unknown',
    label: adapterLabel || `Adapter type ${info.adapterType ?? 'unknown'}`
  }

  checks.push(
    check(
      'adapter',
      'requestAdapter()',
      'pass',
      gpu.webgpu.label
    )
  )

  if (info.adapterType === 'cpu') {
    checks.push(
      check('adapter-type', 'Hardware adapter', 'warn', 'Software (CPU) adapter in use')
    )
  } else {
    checks.push(
      check(
        'adapter-type',
        'Hardware adapter',
        'pass',
        info.adapterType ? `${info.adapterType} adapter` : 'Non-CPU adapter'
      )
    )
  }

  try {
    const format = gpuApi.getPreferredCanvasFormat()
    checks.push(check('canvas-format', 'Preferred canvas format', 'info', format))
  } catch (error) {
    checks.push(check('canvas-format', 'Preferred canvas format', 'warn', String(error)))
  }

  try {
    const device = await adapter.requestDevice()
    const { limits } = device
    checks.push(
      check(
        'device',
        'requestDevice()',
        'pass',
        `maxTexture2D ${limits.maxTextureDimension2D}, maxBuffer ${limits.maxBufferSize}`
      )
    )
    device.destroy()
  } catch (error) {
    checks.push(check('device', 'requestDevice()', 'fail', String(error)))
  }

  gpu.webgl2 = readWebGl2Usage()
  checks.push(...buildWebGlChecks(gpu.webgl2))
  return { checks, gpu }
}

function buildWebGlChecks(webgl2: GpuUsageInfo['webgl2']): DiagnosticCheck[] {
  if (!webgl2) {
    return [
      check('webgl2', 'WebGL2 (brush engine)', 'fail', 'WebGL2 context unavailable')
    ]
  }

  const detail =
    webgl2.renderer.length > 0
      ? webgl2.renderer
      : webgl2.vendor.length > 0
        ? webgl2.vendor
        : 'WebGL2 context created'

  return [check('webgl2', 'WebGL2 (brush engine)', 'pass', detail)]
}
