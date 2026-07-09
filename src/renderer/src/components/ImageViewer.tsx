import type { Component } from 'solid-js'
import { createEffect, createSignal, on, onCleanup, For } from 'solid-js'
import type { ImageLayers } from '../../../shared/image-layers'
import { toLocalImageUrl } from '../lib/local-image-url'

const MAX_SCALE_MULTIPLIER = 16
const ZOOM_INTENSITY = 0.0015
const FIT_PADDING = 16
const LAYERS = ['prev', 'current', 'next'] as const
type LayerRole = (typeof LAYERS)[number]

interface SidePadding {
  left: number
  top: number
  right: number
  bottom: number
}

interface ViewState {
  scale: number
  panX: number
  panY: number
  fitScale: number
  minScale: number
  initialPaddings: SidePadding
}

const EMPTY_PADDING: SidePadding = { left: 0, top: 0, right: 0, bottom: 0 }
const EMPTY_PATHS: Record<LayerRole, string | null> = { prev: null, current: null, next: null }
const EMPTY_READY: Record<LayerRole, boolean> = { prev: false, current: false, next: false }
const EMPTY_SIZES: Record<LayerRole, { width: number; height: number } | null> = {
  prev: null,
  current: null,
  next: null
}

function clampValue(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2
  return Math.min(max, Math.max(min, value))
}

function computeFit(
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number
): ViewState {
  const innerWidth = Math.max(0, viewportWidth - FIT_PADDING * 2)
  const innerHeight = Math.max(0, viewportHeight - FIT_PADDING * 2)
  const fitScale = Math.min(innerWidth / imageWidth, innerHeight / imageHeight)
  const scaledWidth = imageWidth * fitScale
  const scaledHeight = imageHeight * fitScale
  const panX = FIT_PADDING + (innerWidth - scaledWidth) / 2
  const panY = FIT_PADDING + (innerHeight - scaledHeight) / 2

  return {
    fitScale,
    scale: fitScale,
    minScale: fitScale,
    panX,
    panY,
    initialPaddings: {
      left: panX,
      top: panY,
      right: viewportWidth - panX - scaledWidth,
      bottom: viewportHeight - panY - scaledHeight
    }
  }
}

function clampPan(
  panX: number,
  panY: number,
  scale: number,
  fitScale: number,
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number,
  initialPaddings: SidePadding
): { panX: number; panY: number } {
  const ratio = scale / fitScale
  const minLeft = initialPaddings.left * ratio
  const minTop = initialPaddings.top * ratio
  const minRight = initialPaddings.right * ratio
  const minBottom = initialPaddings.bottom * ratio
  const scaledWidth = imageWidth * scale
  const scaledHeight = imageHeight * scale

  return {
    panX: clampValue(panX, viewportWidth - scaledWidth - minRight, minLeft),
    panY: clampValue(panY, viewportHeight - scaledHeight - minBottom, minTop)
  }
}

function isSameImageSrc(image: HTMLImageElement, src: string): boolean {
  try {
    return new URL(image.src, window.location.href).href === new URL(src, window.location.href).href
  } catch {
    return image.src === src
  }
}

const ImageViewer: Component<{
  layers: ImageLayers
  onLoad: (dims: { width: number; height: number }) => void
  onError: () => void
}> = (props) => {
  let viewportRef: HTMLDivElement | undefined
  const layerRefs: Record<LayerRole, HTMLImageElement | undefined> = {
    prev: undefined,
    current: undefined,
    next: undefined
  }

  const [scale, setScale] = createSignal(1)
  const [panX, setPanX] = createSignal(0)
  const [panY, setPanY] = createSignal(0)
  const [fitScale, setFitScale] = createSignal(1)
  const [minScale, setMinScale] = createSignal(0.1)
  const [initialPaddings, setInitialPaddings] = createSignal<SidePadding>(EMPTY_PADDING)
  const [imageSize, setImageSize] = createSignal<{ width: number; height: number } | null>(null)
  const [layerPaths, setLayerPaths] = createSignal<Record<LayerRole, string | null>>(EMPTY_PATHS)
  const [layerReady, setLayerReady] = createSignal<Record<LayerRole, boolean>>(EMPTY_READY)
  const [layerSizes, setLayerSizes] = createSignal(EMPTY_SIZES)
  const [visibleRole, setVisibleRole] = createSignal<LayerRole>('current')
  const [showVisible, setShowVisible] = createSignal(false)
  const [panning, setPanning] = createSignal(false)
  const [sideLayersEnabled, setSideLayersEnabled] = createSignal(false)

  let panStartX = 0
  let panStartY = 0
  let panOriginX = 0
  let panOriginY = 0
  let paintGeneration = 0
  let currentActivation = 0
  let navigationLayers: ImageLayers = { prevPath: null, currentPath: '', nextPath: null }
  let navigationPath = ''
  let sideSyncLayers: ImageLayers | null = null
  const [sideSyncTick, setSideSyncTick] = createSignal(0)

  const maxScale = (): number => Math.max(minScale() * MAX_SCALE_MULTIPLIER, 1)

  const applyView = (view: ViewState): void => {
    setScale(view.scale)
    setFitScale(view.fitScale)
    setMinScale(view.minScale)
    setInitialPaddings(view.initialPaddings)
    setPanX(view.panX)
    setPanY(view.panY)
  }

  const clampCurrentPan = (
    nextPanX: number,
    nextPanY: number,
    nextScale = scale()
  ): { panX: number; panY: number } => {
    const viewport = viewportRef
    const size = imageSize()
    if (!viewport || !size) return { panX: nextPanX, panY: nextPanY }

    return clampPan(
      nextPanX,
      nextPanY,
      nextScale,
      fitScale(),
      viewport.clientWidth,
      viewport.clientHeight,
      size.width,
      size.height,
      initialPaddings()
    )
  }

  const setClampedPan = (nextPanX: number, nextPanY: number, nextScale = scale()): void => {
    const clamped = clampCurrentPan(nextPanX, nextPanY, nextScale)
    setPanX(clamped.panX)
    setPanY(clamped.panY)
  }

  const fitToViewport = (size: { width: number; height: number }): void => {
    const viewport = viewportRef
    if (!viewport) return

    applyView(computeFit(viewport.clientWidth, viewport.clientHeight, size.width, size.height))
  }

  const zoomAt = (clientX: number, clientY: number, nextScale: number): void => {
    const viewport = viewportRef
    if (!viewport) return

    const rect = viewport.getBoundingClientRect()
    const pointerX = clientX - rect.left
    const pointerY = clientY - rect.top
    const currentScale = scale()
    const clampedScale = Math.min(maxScale(), Math.max(minScale(), nextScale))
    const contentX = (pointerX - panX()) / currentScale
    const contentY = (pointerY - panY()) / currentScale

    setScale(clampedScale)
    const nextPanX = pointerX - contentX * clampedScale
    const nextPanY = pointerY - contentY * clampedScale
    setClampedPan(nextPanX, nextPanY, clampedScale)
  }

  const handleWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const nextScale = scale() * Math.exp(-event.deltaY * ZOOM_INTENSITY)
    zoomAt(event.clientX, event.clientY, nextScale)
  }

  const stopPan = (): void => {
    setPanning(false)
    window.removeEventListener('mousemove', handlePanMove)
    window.removeEventListener('mouseup', handlePanEnd)
  }

  const handlePanMove = (event: MouseEvent): void => {
    setClampedPan(
      panOriginX + (event.clientX - panStartX),
      panOriginY + (event.clientY - panStartY)
    )
  }

  const handlePanEnd = (event: MouseEvent): void => {
    if (event.button !== 1) return
    stopPan()
  }

  const handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 1) return
    event.preventDefault()
    setPanning(true)
    panStartX = event.clientX
    panStartY = event.clientY
    panOriginX = panX()
    panOriginY = panY()
    window.addEventListener('mousemove', handlePanMove)
    window.addEventListener('mouseup', handlePanEnd)
  }

  const findLayerWithPath = (path: string | null, readyOnly = false): LayerRole | null => {
    if (!path) return null
    const paths = layerPaths()
    const ready = layerReady()
    for (const role of LAYERS) {
      if (paths[role] !== path) continue
      if (readyOnly && !ready[role]) continue
      return role
    }
    return null
  }

  const findReadyLayer = (path: string | null): LayerRole | null => findLayerWithPath(path, true)

  const getNeededPaths = (layers: ImageLayers): Set<string> => {
    const needed = new Set<string>()
    if (layers.prevPath) needed.add(layers.prevPath)
    needed.add(layers.currentPath)
    if (layers.nextPath) needed.add(layers.nextPath)
    return needed
  }

  const pickLoadTarget = (needed: Set<string>, preferred: LayerRole): LayerRole => {
    const paths = layerPaths()
    const visible = visibleRole()
    const preferredPath = paths[preferred]

    if (!preferredPath || !needed.has(preferredPath)) return preferred

    for (const role of LAYERS) {
      if (role === visible) continue
      const path = paths[role]
      if (!path || !needed.has(path)) return role
    }

    return preferred
  }

  const setLayerPath = (role: LayerRole, path: string | null): void => {
    setLayerPaths((current) => {
      if (current[role] === path) return current

      setLayerReady((ready) => ({ ...ready, [role]: false }))
      setLayerSizes((sizes) => ({ ...sizes, [role]: null }))

      return { ...current, [role]: path }
    })
  }

  const ensurePathOnPage = (
    path: string | null,
    preferred: LayerRole,
    needed: Set<string>
  ): void => {
    if (!path) return
    if (findLayerWithPath(path)) return

    const target = pickLoadTarget(needed, preferred)
    setLayerPath(target, path)
  }

  const pruneUnusedLayers = (needed: Set<string>): void => {
    const visible = visibleRole()
    for (const role of LAYERS) {
      if (role === visible) continue
      const path = layerPaths()[role]
      if (path && !needed.has(path)) {
        setLayerPath(role, null)
      }
    }
  }

  const revealNavigationLayer = (
    role: LayerRole,
    size: { width: number; height: number },
    generation: number,
    path: string
  ): void => {
    setImageSize(size)
    fitToViewport(size)
    requestAnimationFrame(() => {
      if (generation !== paintGeneration || navigationPath !== path) return
      setVisibleRole(role)
      setShowVisible(true)
    })
  }

  const revealLayer = (role: LayerRole): void => {
    const size = layerSizes()[role]
    if (!size) return

    setVisibleRole(role)
    setImageSize(size)
    fitToViewport(size)
    setShowVisible(true)
    props.onLoad(size)
  }

  const requestSideLayerSync = (layers: ImageLayers): void => {
    sideSyncLayers = layers
    setSideSyncTick((tick) => tick + 1)
  }

  const syncSideLayers = (layers: ImageLayers): void => {
    const needed = getNeededPaths(layers)
    ensurePathOnPage(layers.prevPath, 'prev', needed)
    ensurePathOnPage(layers.nextPath, 'next', needed)
    pruneUnusedLayers(needed)
    setSideLayersEnabled(true)
  }

  const applyLayers = (layers: ImageLayers): void => {
    setSideLayersEnabled(false)
    const existing = findReadyLayer(layers.currentPath)

    if (existing) {
      revealLayer(existing)
      requestSideLayerSync(layers)
      return
    }

    if (!findLayerWithPath(layers.currentPath)) {
      const target = pickLoadTarget(new Set([layers.currentPath]), 'current')
      setLayerPath(target, layers.currentPath)
    }
  }

  const activateCurrent = async (role: LayerRole): Promise<void> => {
    const path = props.layers.currentPath
    if (layerPaths()[role] !== path) return

    const activation = ++currentActivation
    const generation = paintGeneration
    const image = layerRefs[role]
    const src = path ? toLocalImageUrl(path) : null
    if (!image || !src || image.naturalWidth === 0) return
    if (!isSameImageSrc(image, src)) return

    try {
      await image.decode()
    } catch {
      // complete/onLoad is still authoritative
    }

    if (
      activation !== currentActivation ||
      generation !== paintGeneration ||
      props.layers.currentPath !== path
    ) {
      return
    }

    const size = { width: image.naturalWidth, height: image.naturalHeight }

    setLayerSizes((current) => ({ ...current, [role]: size }))
    setLayerReady((current) => ({ ...current, [role]: true }))

    if (path === navigationPath) {
      revealNavigationLayer(role, size, generation, path)
      props.onLoad(size)

      if (generation === paintGeneration) {
        requestSideLayerSync(navigationLayers)
      }
      return
    }
  }

  const warmLayer = async (role: LayerRole, generation: number): Promise<void> => {
    const path = layerPaths()[role]
    const image = layerRefs[role]
    const src = path ? toLocalImageUrl(path) : null
    if (!path || !image || !src) return
    if (layerReady()[role]) return
    if (!image.complete || image.naturalWidth === 0) return
    if (!isSameImageSrc(image, src)) return

    try {
      await image.decode()
    } catch {
      // side layers best-effort
    }

    if (generation !== paintGeneration) return
    if (layerPaths()[role] !== path) return

    const size = { width: image.naturalWidth, height: image.naturalHeight }
    setLayerSizes((current) => ({ ...current, [role]: size }))
    setLayerReady((current) => ({ ...current, [role]: true }))
  }

  const handleLayerLoad = (role: LayerRole): void => {
    const path = layerPaths()[role]
    if (!path) return
    if (role !== 'current' && !sideLayersEnabled()) return

    const generation = paintGeneration
    if (path !== navigationPath) {
      void warmLayer(role, generation)
      return
    }

    void activateCurrent(role)
  }

  createEffect(() => {
    sideSyncTick()
    if (!sideSyncLayers) return
    const layers = sideSyncLayers
    sideSyncLayers = null
    syncSideLayers(layers)
  })

  createEffect(
    on(
      () => props.layers,
      (layers) => {
        navigationLayers = layers
        navigationPath = layers.currentPath
        paintGeneration += 1

        applyLayers(layers)
      }
    )
  )

  LAYERS.forEach((role) => {
    createEffect(
      on(
        () => [layerPaths()[role], sideLayersEnabled()] as const,
        ([path, sidesEnabled]) => {
          if (!path) return
          if (role !== 'current' && !sidesEnabled) return

          const image = layerRefs[role]
          if (!image?.complete || image.naturalWidth === 0) return

          const src = toLocalImageUrl(path)
          if (!isSameImageSrc(image, src)) return

          handleLayerLoad(role)
        }
      )
    )
  })

  onCleanup(() => {
    stopPan()
  })

  return (
    <div
      ref={viewportRef}
      class="image-viewport"
      classList={{ 'image-viewport--panning': panning() }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <For each={LAYERS}>
        {(role) => (
          <img
            ref={(element) => {
              layerRefs[role] = element
            }}
            class="image-viewport-img"
            classList={{
              'image-viewport-img--hidden': visibleRole() !== role || !showVisible()
            }}
            data-layer={role}
            src={layerPaths()[role] ? toLocalImageUrl(layerPaths()[role]!) : undefined}
            alt=""
            decoding="async"
            draggable={false}
            width={layerSizes()[role]?.width}
            height={layerSizes()[role]?.height}
            style={{
              transform:
                visibleRole() === role && showVisible()
                  ? `translate(${panX()}px, ${panY()}px) scale(${scale()})`
                  : undefined
            }}
            onLoad={() => handleLayerLoad(role)}
            onError={
              visibleRole() === role && layerPaths()[role] === props.layers.currentPath
                ? props.onError
                : undefined
            }
          />
        )}
      </For>
    </div>
  )
}

export default ImageViewer
