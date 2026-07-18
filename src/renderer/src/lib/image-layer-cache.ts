import { createEffect, createSignal, on, type Accessor } from 'solid-js'
import type { ImageLayers } from '../../../shared/image-layers'
import { toLocalImageUrl } from './local-image-url'

export const LAYERS = ['prev', 'current', 'next'] as const
export type LayerRole = (typeof LAYERS)[number]

export const EMPTY_PATHS: Record<LayerRole, string | null> = {
  prev: null,
  current: null,
  next: null
}
export const EMPTY_READY: Record<LayerRole, boolean> = { prev: false, current: false, next: false }
export const EMPTY_SIZES: Record<LayerRole, { width: number; height: number } | null> = {
  prev: null,
  current: null,
  next: null
}

export function isSameImageSrc(image: HTMLImageElement, src: string): boolean {
  try {
    return new URL(image.src, window.location.href).href === new URL(src, window.location.href).href
  } catch {
    return image.src === src
  }
}

export function getNeededPaths(layers: ImageLayers): Set<string> {
  const needed = new Set<string>()
  if (layers.prevPath) needed.add(layers.prevPath)
  needed.add(layers.currentPath)
  if (layers.nextPath) needed.add(layers.nextPath)
  return needed
}

export function pickLoadTarget(
  needed: Set<string>,
  preferred: LayerRole,
  paths: Record<LayerRole, string | null>,
  visibleRole: LayerRole
): LayerRole {
  const preferredPath = paths[preferred]

  if (!preferredPath || !needed.has(preferredPath)) return preferred

  for (const role of LAYERS) {
    if (role === visibleRole) continue
    const path = paths[role]
    if (!path || !needed.has(path)) return role
  }

  return preferred
}

export interface ImageLayerCacheOptions {
  layerRefs: Record<LayerRole, HTMLImageElement | undefined>
  layers: Accessor<ImageLayers>
  onLoad: (dims: { width: number; height: number }) => void
  onError: () => void
  fitToViewport: (size: { width: number; height: number }) => void
  setImageSize: (size: { width: number; height: number } | null) => void
}

export interface ImageLayerCacheController {
  layerPaths: Accessor<Record<LayerRole, string | null>>
  layerSizes: Accessor<Record<LayerRole, { width: number; height: number } | null>>
  visibleRole: Accessor<LayerRole>
  showVisible: Accessor<boolean>
  handleLayerLoad: (role: LayerRole) => void
  isCurrentLayerError: (role: LayerRole) => boolean
}

export function createImageLayerCache(options: ImageLayerCacheOptions): ImageLayerCacheController {
  const [layerPaths, setLayerPaths] = createSignal<Record<LayerRole, string | null>>(EMPTY_PATHS)
  const [layerReady, setLayerReady] = createSignal<Record<LayerRole, boolean>>(EMPTY_READY)
  const [layerSizes, setLayerSizes] = createSignal(EMPTY_SIZES)
  const [visibleRole, setVisibleRole] = createSignal<LayerRole>('current')
  const [showVisible, setShowVisible] = createSignal(false)
  const [sideLayersEnabled, setSideLayersEnabled] = createSignal(false)

  let paintGeneration = 0
  let currentActivation = 0
  let navigationLayers: ImageLayers = { prevPath: null, currentPath: '', nextPath: null }
  let navigationPath = ''
  let sideSyncLayers: ImageLayers | null = null
  const [sideSyncTick, setSideSyncTick] = createSignal(0)

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

    const target = pickLoadTarget(needed, preferred, layerPaths(), visibleRole())
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
    options.setImageSize(size)
    options.fitToViewport(size)
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
    options.setImageSize(size)
    options.fitToViewport(size)
    setShowVisible(true)
    options.onLoad(size)
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
      const target = pickLoadTarget(
        new Set([layers.currentPath]),
        'current',
        layerPaths(),
        visibleRole()
      )
      setLayerPath(target, layers.currentPath)
    }
  }

  const activateCurrent = async (role: LayerRole): Promise<void> => {
    const path = options.layers().currentPath
    if (layerPaths()[role] !== path) return

    const activation = ++currentActivation
    const generation = paintGeneration
    const image = options.layerRefs[role]
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
      options.layers().currentPath !== path
    ) {
      return
    }

    const size = { width: image.naturalWidth, height: image.naturalHeight }

    setLayerSizes((current) => ({ ...current, [role]: size }))
    setLayerReady((current) => ({ ...current, [role]: true }))

    if (path === navigationPath) {
      revealNavigationLayer(role, size, generation, path)
      options.onLoad(size)

      if (generation === paintGeneration) {
        requestSideLayerSync(navigationLayers)
      }
      return
    }
  }

  const warmLayer = async (role: LayerRole, generation: number): Promise<void> => {
    const path = layerPaths()[role]
    const image = options.layerRefs[role]
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
      () => options.layers(),
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

          const image = options.layerRefs[role]
          if (!image?.complete || image.naturalWidth === 0) return

          const src = toLocalImageUrl(path)
          if (!isSameImageSrc(image, src)) return

          handleLayerLoad(role)
        }
      )
    )
  })

  const isCurrentLayerError = (role: LayerRole): boolean =>
    visibleRole() === role && layerPaths()[role] === options.layers().currentPath

  return {
    layerPaths,
    layerSizes,
    visibleRole,
    showVisible,
    handleLayerLoad,
    isCurrentLayerError
  }
}
