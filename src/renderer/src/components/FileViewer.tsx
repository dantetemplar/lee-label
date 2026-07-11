import type { Component } from 'solid-js'
import { Match, Show, Switch, createEffect, createSignal, on } from 'solid-js'
import type { FileKind } from '../../../shared/file-types'
import type { ImageLayers } from '../../../shared/image-layers'
import type { Label } from '../../../shared/annotations'
import type { SegmentationMode } from '../../../shared/segmentation'
import AnnotationToolbar, { type AnnotationTool } from './AnnotationToolbar'
import ImageViewer from './ImageViewer'
import type { AnnotationStore } from '../lib/annotation-store'
import type { SemanticMapStore } from '../lib/semantic-map-store'
import { toRelativePath } from '../../../shared/paths'

export interface FileInfo {
  name: string
  size: number
  width?: number
  height?: number
  lines?: number
  dirty?: boolean
}

const TextEditor: Component<{
  value: () => string
  onChange: (value: string) => void
  onSave: () => void
}> = (props) => {
  const handleKeyDown = (event: KeyboardEvent): void => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      props.onSave()
    }
  }

  return (
    <textarea
      class="box-border h-full w-full cursor-text resize-none overflow-auto border-none bg-base-100 p-3 font-mono text-[13px] leading-normal break-words whitespace-pre text-base-content select-text focus:outline-none focus:ring-1 focus:ring-primary/40"
      value={props.value()}
      spellcheck={false}
      autocomplete="off"
      autocapitalize="off"
      onInput={(event) => props.onChange(event.currentTarget.value)}
      onKeyDown={handleKeyDown}
    />
  )
}

const FileViewer: Component<{
  kind: () => FileKind | null
  fileName: () => string | null
  filePath: () => string | null
  projectRoot: () => string | null
  imageLayers: () => ImageLayers | null
  textLoading: () => boolean
  textDraft: () => string
  error: () => string | null
  labels: () => Label[]
  activeLabelId: () => string | null
  annotationStore: AnnotationStore | null
  semanticStore: SemanticMapStore | null
  segmentationMode: () => SegmentationMode
  onImageLoad: (dims: { width: number; height: number }) => void
  onTextChange: (value: string) => void
  onTextSave: () => void
  activeTool: () => AnnotationTool
  onToolChange: (tool: AnnotationTool) => void
  brushSize: () => number
  shrinkBrushAtMaxZoom: () => boolean
}> = (props) => {
  const [imageError, setImageError] = createSignal(false)
  const [imageDimensions, setImageDimensions] = createSignal<{ width: number; height: number } | null>(
    null
  )

  createEffect(() => {
    props.imageLayers()
    setImageError(false)
    setImageDimensions(null)
  })

  createEffect(
    on(
      () => {
        const layers = props.imageLayers()
        const root = props.projectRoot()
        const dims = imageDimensions()
        if (!layers || !root || !dims) return null
        return {
          relativePath: toRelativePath(root, layers.currentPath),
          dims,
          mode: props.segmentationMode()
        }
      },
      (payload) => {
        if (!payload) return
        if (payload.mode === 'semantic') {
          void props.semanticStore?.loadForImage(payload.relativePath, payload.dims)
        } else {
          void props.annotationStore?.loadForImage(payload.relativePath, payload.dims)
        }
      }
    )
  )

  const handleImageLoad = (dims: { width: number; height: number }): void => {
    setImageError(false)
    setImageDimensions(dims)
    props.onImageLoad(dims)
  }

  const showImageLoading = (): boolean => props.kind() === 'image' && !props.imageLayers()

  return (
    <div class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-base-300">
      <Show
        when={props.kind()}
        fallback={
          <div class="flex flex-col items-center gap-1.5 text-base-content/60">
            <p class="m-0 text-sm">Select a file to preview</p>
            <span class="text-xs opacity-70">Choose a file from the explorer</span>
          </div>
        }
      >
        <Switch>
          <Match when={props.error()}>
            <div class="flex flex-col items-center gap-1.5 text-error">
              <p class="m-0 text-sm">{props.error()}</p>
            </div>
          </Match>

          <Match when={props.kind() === 'unsupported'}>
            <div class="flex flex-col items-center gap-1.5 text-base-content/60">
              <p class="m-0 text-sm">Cannot render this file type</p>
              <span class="text-xs opacity-70">{props.fileName()}</span>
            </div>
          </Match>

          <Match when={props.kind() === 'text' && props.filePath()}>
            <Show
              when={!props.textLoading()}
              fallback={<div class="flex flex-col items-center gap-1.5 text-primary">Loading…</div>}
            >
              <div class="relative box-border flex h-full w-full min-h-0 min-w-0 items-stretch justify-stretch p-4">
                <TextEditor
                  value={() => props.textDraft()}
                  onChange={props.onTextChange}
                  onSave={props.onTextSave}
                />
              </div>
            </Show>
          </Match>

          <Match when={props.kind() === 'image'}>
            <Show when={props.imageLayers()}>
              {(layers) => (
                <div class="relative box-border flex h-full w-full min-h-0 min-w-0 flex-row items-stretch justify-stretch">
                  <Show when={imageError()}>
                    <div class="flex flex-col items-center gap-1.5 text-error">
                      <p class="m-0 text-sm">Failed to load image</p>
                    </div>
                  </Show>
                  <Show when={!imageError()}>
                    <ImageViewer
                      layers={layers()}
                      activeTool={props.activeTool}
                      labels={props.labels}
                      activeLabelId={props.activeLabelId}
                      brushSize={props.brushSize}
                      shrinkBrushAtMaxZoom={props.shrinkBrushAtMaxZoom}
                      annotationStore={props.annotationStore}
                      semanticStore={props.semanticStore}
                      segmentationMode={props.segmentationMode}
                      onLoad={handleImageLoad}
                      onError={() => setImageError(true)}
                    />
                  </Show>
                  <AnnotationToolbar
                    activeTool={props.activeTool}
                    segmentationMode={props.segmentationMode}
                    onToolChange={props.onToolChange}
                  />
                </div>
              )}
            </Show>
            <Show when={showImageLoading()}>
              <div class="flex flex-col items-center gap-1.5 text-primary">Loading…</div>
            </Show>
          </Match>
        </Switch>
      </Show>
    </div>
  )
}

export default FileViewer
