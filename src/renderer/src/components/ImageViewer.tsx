import type { Component } from 'solid-js'
import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'
import type { ImageLayers } from '../../../shared/image-layers'
import { useProjectContext } from '../lib/project-context'
import type { TopologyAlert } from '../lib/polygon/topology-session'
import { createImageLayerCache, LAYERS, type LayerRole } from '../lib/image-layer-cache'
import { createImageViewport } from '../lib/image-viewport'
import { toLocalImageUrl } from '../lib/local-image-url'
import AnnotationOverlay from './AnnotationOverlay'
import TopologyAlertBanner from './TopologyAlertBanner'

const ImageViewer: Component<{
  layers: ImageLayers
  onLoad: (dims: { width: number; height: number }) => void
  onError: () => void
}> = (props) => {
  const project = useProjectContext()

  let viewportRef: HTMLDivElement | undefined
  const layerRefs: Record<LayerRole, HTMLImageElement | undefined> = {
    prev: undefined,
    current: undefined,
    next: undefined
  }

  const [topologyAlert, setTopologyAlert] = createSignal<TopologyAlert | null>(null)
  const [topologyAlertOnLeft, setTopologyAlertOnLeft] = createSignal(false)
  const [imageSize, setImageSize] = createSignal<{ width: number; height: number } | null>(null)

  let lastPointerClient: { x: number; y: number } | null = null

  const isAnnotationMode = (): boolean => true

  const viewport = createImageViewport({
    viewportRef: () => viewportRef,
    imageSize,
    isAnnotationMode
  })

  const layerCache = createImageLayerCache({
    layerRefs,
    layers: () => props.layers,
    onLoad: props.onLoad,
    onError: props.onError,
    fitToViewport: viewport.fitToViewport,
    setImageSize
  })

  onCleanup(() => {
    viewport.stopPan()
  })

  const viewportCursor = (): string => {
    if (viewport.panning()) return 'grabbing'
    if (project.activeTool() === 'mask') return 'none'
    if (project.activeTool() === 'rectangle') return 'crosshair'
    return 'default'
  }

  const focusWorkspace = (): void => {
    const el = viewportRef
    if (!el) return

    const active = document.activeElement
    if (active instanceof HTMLElement && active !== el && !el.contains(active)) {
      active.blur()
    }

    if (document.activeElement !== el) {
      el.focus({ preventScroll: true })
    }
  }

  const positionTopologyAlert = (clientX: number, clientY: number): void => {
    if (!viewportRef) return
    const bounds = viewportRef.getBoundingClientRect()
    const pointerInRightBottom =
      clientX >= bounds.left + bounds.width * 0.6 &&
      clientY >= bounds.top + bounds.height * 0.6
    setTopologyAlertOnLeft(pointerInRightBottom)
  }

  const handleViewportPointerMove = (event: PointerEvent): void => {
    lastPointerClient = { x: event.clientX, y: event.clientY }
  }

  const handleTopologyAlertChange = (alert: TopologyAlert | null): void => {
    if (alert && lastPointerClient) {
      positionTopologyAlert(lastPointerClient.x, lastPointerClient.y)
    } else {
      setTopologyAlertOnLeft(false)
    }
    setTopologyAlert(alert)
  }

  onMount(() => {
    const el = viewportRef
    if (!el) return
    el.addEventListener('pointerdown', focusWorkspace, { capture: true })
    onCleanup(() => el.removeEventListener('pointerdown', focusWorkspace, { capture: true }))
  })

  return (
    <div
      ref={viewportRef}
      class="relative min-h-0 min-w-0 flex-1 overflow-hidden touch-none outline-none focus:outline-none"
      classList={{ 'cursor-grabbing': viewport.panning() }}
      style={{ cursor: viewportCursor() }}
      tabindex={0}
      onWheel={viewport.handleWheel}
      onMouseDown={viewport.handleMouseDown}
      onPointerMove={handleViewportPointerMove}
      onContextMenu={(event) => event.preventDefault()}
    >
      <TopologyAlertBanner
        alert={topologyAlert}
        onLeft={topologyAlertOnLeft}
        onDismissFocus={focusWorkspace}
      />
      <For each={LAYERS}>
        {(role) => (
          <img
            ref={(element) => {
              layerRefs[role] = element
            }}
            class="pointer-events-none absolute top-0 left-0 block max-w-none max-h-none origin-top-left select-none will-change-transform"
            classList={{
              invisible: layerCache.visibleRole() !== role || !layerCache.showVisible()
            }}
            data-layer={role}
            src={layerCache.layerPaths()[role] ? toLocalImageUrl(layerCache.layerPaths()[role]!) : undefined}
            alt=""
            decoding="async"
            draggable={false}
            width={layerCache.layerSizes()[role]?.width}
            height={layerCache.layerSizes()[role]?.height}
            style={{
              transform:
                layerCache.visibleRole() === role && layerCache.showVisible()
                  ? `translate(${viewport.panX()}px, ${viewport.panY()}px) scale(${viewport.scale()})`
                  : undefined
            }}
            onLoad={() => layerCache.handleLayerLoad(role)}
            onError={layerCache.isCurrentLayerError(role) ? props.onError : undefined}
          />
        )}
      </For>
      <Show when={layerCache.showVisible()}>
        <AnnotationOverlay
          viewportRef={() => viewportRef}
          transform={viewport.viewTransform}
          imageSize={imageSize}
          activeTool={project.activeTool}
          activeLabelId={project.activeLabelId}
          brushSize={project.brushSize}
          shrinkBrushAtMaxZoom={project.shrinkBrushAtMaxZoom}
          labels={project.labels}
          store={project.annotationStore}
          semanticStore={project.semanticStore}
          segmentationMode={() => project.projectSettings().segmentationMode}
          onTopologyAlertChange={handleTopologyAlertChange}
        />
      </Show>
    </div>
  )
}

export default ImageViewer
