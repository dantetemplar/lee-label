import {
    ACTIVE_STROKE_OPACITY,
    COMMITTED_MASK_OPACITY,
    COMMITTED_MASK_SELECTED_OPACITY,
    SESSION_MASK_OPACITY
} from './constants'
import {
    CAPSULE_FRAGMENT,
    CAPSULE_VERTEX,
    COMPOSITE_FRAGMENT,
    COMPOSITE_VERTEX,
    PLACED_MASK_FRAGMENT,
    PLACED_MASK_VERTEX,
    PREVIEW_FRAGMENT,
    PREVIEW_VERTEX
} from './shaders'

export interface SavedMaskLayer {
  id: string
  version: string
  bounds: { x: number; y: number; width: number; height: number }
  data: Uint8Array
  colorRgb: [number, number, number]
}

export interface Point2D {
  x: number
  y: number
}

export interface CapsuleSegment {
  from: Point2D
  to: Point2D
}

export type StampTarget = 'active' | 'session'

const QUAD_CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
const PLACED_CORNERS = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1])
const FULLSCREEN_UVS = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1])

interface CachedSavedMask {
  version: string
  texture: WebGLTexture
  width: number
  height: number
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Failed to create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'Unknown shader error'
    gl.deleteShader(shader)
    throw new Error(log)
  }
  return shader
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  if (!program) throw new Error('Failed to create program')
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'Unknown link error'
    gl.deleteProgram(program)
    throw new Error(log)
  }
  return program
}

function createMaskTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number
): { texture: WebGLTexture; format: number } {
  const tryFormat = (internalFormat: number): { texture: WebGLTexture; format: number } | null => {
    const texture = gl.createTexture()
    if (!texture) return null

    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat, width, height)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    const framebuffer = gl.createFramebuffer()
    if (!framebuffer) {
      gl.deleteTexture(texture)
      return null
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteFramebuffer(framebuffer)

    if (!complete) {
      gl.deleteTexture(texture)
      return null
    }

    gl.bindTexture(gl.TEXTURE_2D, null)
    return { texture, format: internalFormat === gl.R8 ? gl.RED : gl.RGBA }
  }

  const r8 = tryFormat(gl.R8)
  if (r8) return r8

  const rgba = tryFormat(gl.RGBA8)
  if (rgba) return rgba

  throw new Error('No supported mask texture format')
}

function uploadMaskDataTexture(
  gl: WebGL2RenderingContext,
  data: Uint8Array,
  width: number,
  height: number
): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Failed to create mask data texture')

  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.bindTexture(gl.TEXTURE_2D, null)
  return texture
}

function createFramebuffer(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture
): WebGLFramebuffer {
  const framebuffer = gl.createFramebuffer()
  if (!framebuffer) throw new Error('Failed to create framebuffer')
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Framebuffer incomplete: ${status}`)
  }
  return framebuffer
}

export class BrushEngine {
  private gl: WebGL2RenderingContext
  private width = 0
  private height = 0

  private sessionTexture: WebGLTexture | null = null
  private activeTexture: WebGLTexture | null = null
  private sessionFramebuffer: WebGLFramebuffer | null = null
  private activeFramebuffer: WebGLFramebuffer | null = null
  private maskReadFormat: number = 0

  private capsuleProgram: WebGLProgram
  private compositeProgram: WebGLProgram
  private previewProgram: WebGLProgram
  private placedMaskProgram: WebGLProgram

  private capsuleVao: WebGLVertexArrayObject
  private capsuleCornerBuffer: WebGLBuffer
  private capsuleSegmentBuffer: WebGLBuffer

  private compositeVao: WebGLVertexArrayObject
  private compositeUvBuffer: WebGLBuffer

  private previewVao: WebGLVertexArrayObject
  private previewCornerBuffer: WebGLBuffer

  private placedMaskVao: WebGLVertexArrayObject
  private placedMaskCornerBuffer: WebGLBuffer

  private capsuleMaskSizePx: WebGLUniformLocation
  private capsuleRadiusPx: WebGLUniformLocation

  private compositeSessionMask: WebGLUniformLocation
  private compositeActiveMask: WebGLUniformLocation
  private compositeMaskColor: WebGLUniformLocation
  private compositeSessionOpacity: WebGLUniformLocation
  private compositeActiveOpacity: WebGLUniformLocation

  private previewMaskSizePx: WebGLUniformLocation
  private previewCenterPx: WebGLUniformLocation
  private previewRadiusPx: WebGLUniformLocation
  private previewStrokeWidthPx: WebGLUniformLocation
  private previewInnerStrokeWidthPx: WebGLUniformLocation
  private previewOpacity: WebGLUniformLocation

  private placedImageSizePx: WebGLUniformLocation
  private placedBounds: WebGLUniformLocation
  private placedMaskSampler: WebGLUniformLocation
  private placedMaskColor: WebGLUniformLocation
  private placedOpacity: WebGLUniformLocation

  private instanceCapacity = 0
  private segmentData = new Float32Array(0)
  private savedMaskCache = new Map<string, CachedSavedMask>()

  private hasDirty = false
  private dirtyMinX = 0
  private dirtyMinY = 0
  private dirtyMaxX = 0
  private dirtyMaxY = 0

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true
    })
    if (!gl) throw new Error('WebGL2 is not available')
    this.gl = gl

    this.capsuleProgram = createProgram(gl, CAPSULE_VERTEX, CAPSULE_FRAGMENT)
    this.compositeProgram = createProgram(gl, COMPOSITE_VERTEX, COMPOSITE_FRAGMENT)
    this.previewProgram = createProgram(gl, PREVIEW_VERTEX, PREVIEW_FRAGMENT)
    this.placedMaskProgram = createProgram(gl, PLACED_MASK_VERTEX, PLACED_MASK_FRAGMENT)

    this.capsuleVao = gl.createVertexArray()!
    this.capsuleCornerBuffer = gl.createBuffer()!
    this.capsuleSegmentBuffer = gl.createBuffer()!

    gl.bindVertexArray(this.capsuleVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.capsuleCornerBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, PLACED_CORNERS, gl.STATIC_DRAW)
    const capsuleCornerLoc = gl.getAttribLocation(this.capsuleProgram, 'aCorner')
    gl.enableVertexAttribArray(capsuleCornerLoc)
    gl.vertexAttribPointer(capsuleCornerLoc, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.capsuleSegmentBuffer)
    const capsuleStartLoc = gl.getAttribLocation(this.capsuleProgram, 'aSegStart')
    const capsuleEndLoc = gl.getAttribLocation(this.capsuleProgram, 'aSegEnd')
    gl.enableVertexAttribArray(capsuleStartLoc)
    gl.enableVertexAttribArray(capsuleEndLoc)
    gl.vertexAttribPointer(capsuleStartLoc, 2, gl.FLOAT, false, 16, 0)
    gl.vertexAttribPointer(capsuleEndLoc, 2, gl.FLOAT, false, 16, 8)
    gl.vertexAttribDivisor(capsuleStartLoc, 1)
    gl.vertexAttribDivisor(capsuleEndLoc, 1)
    gl.bindVertexArray(null)

    this.compositeVao = gl.createVertexArray()!
    this.compositeUvBuffer = gl.createBuffer()!
    gl.bindVertexArray(this.compositeVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.compositeUvBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_UVS, gl.STATIC_DRAW)
    const compositeUvLoc = gl.getAttribLocation(this.compositeProgram, 'aUv')
    gl.enableVertexAttribArray(compositeUvLoc)
    gl.vertexAttribPointer(compositeUvLoc, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    this.previewVao = gl.createVertexArray()!
    this.previewCornerBuffer = gl.createBuffer()!
    gl.bindVertexArray(this.previewVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.previewCornerBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_CORNERS, gl.STATIC_DRAW)
    const previewCornerLoc = gl.getAttribLocation(this.previewProgram, 'aCorner')
    gl.enableVertexAttribArray(previewCornerLoc)
    gl.vertexAttribPointer(previewCornerLoc, 2, gl.FLOAT, false, 0, 0)
    this.placedMaskVao = gl.createVertexArray()!
    this.placedMaskCornerBuffer = gl.createBuffer()!
    gl.bindVertexArray(this.placedMaskVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.placedMaskCornerBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, PLACED_CORNERS, gl.STATIC_DRAW)
    const placedCornerLoc = gl.getAttribLocation(this.placedMaskProgram, 'aCorner')
    gl.enableVertexAttribArray(placedCornerLoc)
    gl.vertexAttribPointer(placedCornerLoc, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    this.capsuleMaskSizePx = gl.getUniformLocation(this.capsuleProgram, 'uMaskSizePx')!
    this.capsuleRadiusPx = gl.getUniformLocation(this.capsuleProgram, 'uRadiusPx')!

    this.compositeSessionMask = gl.getUniformLocation(this.compositeProgram, 'uSessionMask')!
    this.compositeActiveMask = gl.getUniformLocation(this.compositeProgram, 'uActiveStrokeMask')!
    this.compositeMaskColor = gl.getUniformLocation(this.compositeProgram, 'uMaskColor')!
    this.compositeSessionOpacity = gl.getUniformLocation(this.compositeProgram, 'uSessionOpacity')!
    this.compositeActiveOpacity = gl.getUniformLocation(this.compositeProgram, 'uActiveOpacity')!

    this.previewMaskSizePx = gl.getUniformLocation(this.previewProgram, 'uMaskSizePx')!
    this.previewCenterPx = gl.getUniformLocation(this.previewProgram, 'uCenterPx')!
    this.previewRadiusPx = gl.getUniformLocation(this.previewProgram, 'uRadiusPx')!
    this.previewStrokeWidthPx = gl.getUniformLocation(this.previewProgram, 'uStrokeWidthPx')!
    this.previewInnerStrokeWidthPx = gl.getUniformLocation(this.previewProgram, 'uInnerStrokeWidthPx')!
    this.previewOpacity = gl.getUniformLocation(this.previewProgram, 'uOpacity')!

    this.placedImageSizePx = gl.getUniformLocation(this.placedMaskProgram, 'uImageSizePx')!
    this.placedBounds = gl.getUniformLocation(this.placedMaskProgram, 'uBounds')!
    this.placedMaskSampler = gl.getUniformLocation(this.placedMaskProgram, 'uMask')!
    this.placedMaskColor = gl.getUniformLocation(this.placedMaskProgram, 'uMaskColor')!
    this.placedOpacity = gl.getUniformLocation(this.placedMaskProgram, 'uOpacity')!
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return
    if (this.width === width && this.height === height) return

    const { gl } = this
    this.disposeMaskTargets()

    this.width = width
    this.height = height

    const session = createMaskTexture(gl, width, height)
    const active = createMaskTexture(gl, width, height)
    this.maskReadFormat = session.format
    this.sessionTexture = session.texture
    this.activeTexture = active.texture
    this.sessionFramebuffer = createFramebuffer(gl, this.sessionTexture)
    this.activeFramebuffer = createFramebuffer(gl, this.activeTexture)

    this.resetDirtyBounds()
  }

  dispose(): void {
    const { gl } = this
    this.disposeMaskTargets()
    this.disposeSavedMaskCache()
    gl.deleteProgram(this.capsuleProgram)
    gl.deleteProgram(this.compositeProgram)
    gl.deleteProgram(this.previewProgram)
    gl.deleteProgram(this.placedMaskProgram)
    gl.deleteVertexArray(this.capsuleVao)
    gl.deleteBuffer(this.capsuleCornerBuffer)
    gl.deleteBuffer(this.capsuleSegmentBuffer)
    gl.deleteVertexArray(this.compositeVao)
    gl.deleteBuffer(this.compositeUvBuffer)
    gl.deleteVertexArray(this.previewVao)
    gl.deleteBuffer(this.previewCornerBuffer)
    gl.deleteVertexArray(this.placedMaskVao)
    gl.deleteBuffer(this.placedMaskCornerBuffer)
  }

  syncSavedMasks(layers: SavedMaskLayer[]): void {
    const { gl } = this
    const nextIds = new Set(layers.map((layer) => layer.id))

    for (const [id, cached] of this.savedMaskCache) {
      if (nextIds.has(id)) continue
      gl.deleteTexture(cached.texture)
      this.savedMaskCache.delete(id)
    }

    for (const layer of layers) {
      const { bounds, data } = layer
      const cached = this.savedMaskCache.get(layer.id)
      if (cached && cached.version === layer.version) continue

      if (cached) gl.deleteTexture(cached.texture)

      this.savedMaskCache.set(layer.id, {
        version: layer.version,
        width: bounds.width,
        height: bounds.height,
        texture: uploadMaskDataTexture(gl, data, bounds.width, bounds.height)
      })
    }
  }

  hasSessionContent(): boolean {
    return this.hasDirty
  }

  clearActiveStroke(): void {
    this.clearFramebuffer(this.activeFramebuffer)
  }

  clearSession(): void {
    this.clearFramebuffer(this.sessionFramebuffer)
    this.resetDirtyBounds()
  }

  stampCapsules(segments: CapsuleSegment[], radiusPx: number, target: StampTarget): void {
    if (segments.length === 0 || !this.sessionTexture || !this.activeTexture) return

    const { gl } = this
    const framebuffer = target === 'session' ? this.sessionFramebuffer : this.activeFramebuffer
    if (!framebuffer) return

    for (const segment of segments) {
      this.expandDirtyBoundsForSegment(segment.from, segment.to, radiusPx)
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.viewport(0, 0, this.width, this.height)
    gl.useProgram(this.capsuleProgram)
    gl.enable(gl.BLEND)
    gl.blendEquation(gl.MAX)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.colorMask(true, true, true, true)
    gl.uniform2f(this.capsuleMaskSizePx, this.width, this.height)
    gl.uniform1f(this.capsuleRadiusPx, radiusPx)

    this.uploadSegments(segments)
    gl.bindVertexArray(this.capsuleVao)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segments.length)
    gl.bindVertexArray(null)
    gl.disable(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  stampCapsule(from: Point2D, to: Point2D, radiusPx: number, target: StampTarget): void {
    this.stampCapsules([{ from, to }], radiusPx, target)
  }

  clearDisplay(): void {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.width, this.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  renderScene(
    savedMasks: SavedMaskLayer[],
    brushColorRgb: [number, number, number],
    showPreview: boolean,
    preview?: {
      center: Point2D
      radiusPx: number
      strokeWidthPx: number
      innerStrokeWidthPx: number
      alpha: number
    },
    selectedMaskId?: string | null
  ): void {
    if (!this.sessionTexture || !this.activeTexture || this.width <= 0 || this.height <= 0) return

    this.syncSavedMasks(savedMasks)

    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.width, this.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.enable(gl.BLEND)
    gl.blendEquation(gl.FUNC_ADD)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    this.drawSavedMasks(savedMasks, selectedMaskId)

    gl.useProgram(this.compositeProgram)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sessionTexture)
    gl.uniform1i(this.compositeSessionMask, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.activeTexture)
    gl.uniform1i(this.compositeActiveMask, 1)
    gl.uniform3fv(this.compositeMaskColor, brushColorRgb)
    gl.uniform1f(this.compositeSessionOpacity, SESSION_MASK_OPACITY)
    gl.uniform1f(this.compositeActiveOpacity, ACTIVE_STROKE_OPACITY)
    gl.bindVertexArray(this.compositeVao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)

    if (showPreview && preview) {
      gl.useProgram(this.previewProgram)
      gl.uniform2f(this.previewMaskSizePx, this.width, this.height)
      gl.uniform2f(this.previewCenterPx, preview.center.x, preview.center.y)
      gl.uniform1f(this.previewRadiusPx, preview.radiusPx)
      gl.uniform1f(this.previewStrokeWidthPx, preview.strokeWidthPx)
      gl.uniform1f(this.previewInnerStrokeWidthPx, preview.innerStrokeWidthPx)
      gl.uniform1f(this.previewOpacity, preview.alpha)
      gl.bindVertexArray(this.previewVao)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      gl.bindVertexArray(null)
    }

    gl.disable(gl.BLEND)
  }

  readSessionMask(): Uint8Array | null {
    if (!this.sessionFramebuffer || !this.hasDirty) return null

    const { gl, width, height } = this
    const minX = Math.max(0, Math.floor(this.dirtyMinX))
    const minY = Math.max(0, Math.floor(this.dirtyMinY))
    const maxX = Math.min(width - 1, Math.ceil(this.dirtyMaxX))
    const maxY = Math.min(height - 1, Math.ceil(this.dirtyMaxY))
    const regionW = maxX - minX + 1
    const regionH = maxY - minY + 1
    if (regionW <= 0 || regionH <= 0) return null

    const pixels = new Uint8Array(regionW * regionH * (this.maskReadFormat === gl.RGBA ? 4 : 1))
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sessionFramebuffer)
    gl.readPixels(minX, height - maxY - 1, regionW, regionH, this.maskReadFormat, gl.UNSIGNED_BYTE, pixels)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    const full = new Uint8Array(width * height)
    for (let row = 0; row < regionH; row++) {
      const imageY = maxY - row
      for (let col = 0; col < regionW; col++) {
        const srcIndex =
          this.maskReadFormat === gl.RGBA ? (row * regionW + col) * 4 : row * regionW + col
        full[imageY * width + minX + col] = pixels[srcIndex]
      }
    }

    return full
  }

  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height }
  }

  private drawSavedMasks(savedMasks: SavedMaskLayer[], selectedMaskId?: string | null): void {
    if (savedMasks.length === 0) return

    const { gl } = this
    gl.useProgram(this.placedMaskProgram)
    gl.uniform2f(this.placedImageSizePx, this.width, this.height)
    gl.uniform1i(this.placedMaskSampler, 0)
    gl.bindVertexArray(this.placedMaskVao)

    for (const layer of savedMasks) {
      const cached = this.savedMaskCache.get(layer.id)
      if (!cached) continue

      gl.uniform1f(
        this.placedOpacity,
        layer.id === selectedMaskId ? COMMITTED_MASK_SELECTED_OPACITY : COMMITTED_MASK_OPACITY
      )
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, cached.texture)
      gl.uniform4f(
        this.placedBounds,
        layer.bounds.x,
        layer.bounds.y,
        layer.bounds.width,
        layer.bounds.height
      )
      gl.uniform3fv(this.placedMaskColor, layer.colorRgb)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    gl.bindVertexArray(null)
  }

  private disposeSavedMaskCache(): void {
    const { gl } = this
    for (const cached of this.savedMaskCache.values()) {
      gl.deleteTexture(cached.texture)
    }
    this.savedMaskCache.clear()
  }

  private disposeMaskTargets(): void {
    const { gl } = this
    if (this.sessionTexture) gl.deleteTexture(this.sessionTexture)
    if (this.activeTexture) gl.deleteTexture(this.activeTexture)
    if (this.sessionFramebuffer) gl.deleteFramebuffer(this.sessionFramebuffer)
    if (this.activeFramebuffer) gl.deleteFramebuffer(this.activeFramebuffer)
    this.sessionTexture = null
    this.activeTexture = null
    this.sessionFramebuffer = null
    this.activeFramebuffer = null
    this.resetDirtyBounds()
  }

  private clearFramebuffer(framebuffer: WebGLFramebuffer | null): void {
    if (!framebuffer) return
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.viewport(0, 0, this.width, this.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private resetDirtyBounds(): void {
    this.hasDirty = false
    this.dirtyMinX = 0
    this.dirtyMinY = 0
    this.dirtyMaxX = 0
    this.dirtyMaxY = 0
  }

  private expandDirtyBoundsForSegment(from: Point2D, to: Point2D, radius: number): void {
    const minX = Math.min(from.x, to.x) - radius
    const minY = Math.min(from.y, to.y) - radius
    const maxX = Math.max(from.x, to.x) + radius
    const maxY = Math.max(from.y, to.y) + radius
    if (!this.hasDirty) {
      this.dirtyMinX = minX
      this.dirtyMinY = minY
      this.dirtyMaxX = maxX
      this.dirtyMaxY = maxY
      this.hasDirty = true
      return
    }
    this.dirtyMinX = Math.min(this.dirtyMinX, minX)
    this.dirtyMinY = Math.min(this.dirtyMinY, minY)
    this.dirtyMaxX = Math.max(this.dirtyMaxX, maxX)
    this.dirtyMaxY = Math.max(this.dirtyMaxY, maxY)
  }

  private uploadSegments(segments: CapsuleSegment[]): void {
    const { gl } = this
    const needed = segments.length * 4
    if (this.instanceCapacity < needed) {
      this.instanceCapacity = Math.max(needed, this.instanceCapacity * 2 || 32)
      this.segmentData = new Float32Array(this.instanceCapacity)
    }
    for (let index = 0; index < segments.length; index++) {
      const offset = index * 4
      const segment = segments[index]
      this.segmentData[offset] = segment.from.x
      this.segmentData[offset + 1] = segment.from.y
      this.segmentData[offset + 2] = segment.to.x
      this.segmentData[offset + 3] = segment.to.y
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.capsuleSegmentBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.segmentData.subarray(0, needed), gl.DYNAMIC_DRAW)
  }
}
