import type { Component } from 'solid-js'
import { Match, Show, Switch, createEffect, createSignal, on } from 'solid-js'
import type { FileKind } from '../../../shared/file-types'
import type { ImageLayers } from '../../../shared/image-layers'
import type { Label } from '../../../shared/annotations'
import AnnotationToolbar, { type AnnotationTool } from './AnnotationToolbar'
import ImageViewer from './ImageViewer'
import type { AnnotationStore } from '../lib/annotation-store'
import { toRelativePath } from '../lib/project-path'

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
      class="text-viewer"
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
  onImageLoad: (dims: { width: number; height: number }) => void
  onTextChange: (value: string) => void
  onTextSave: () => void
  activeTool: () => AnnotationTool
  onToolChange: (tool: AnnotationTool) => void
  brushSize: () => number
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
        const store = props.annotationStore
        const dims = imageDimensions()
        if (!layers || !root || !store || !dims) return null
        return {
          relativePath: toRelativePath(root, layers.currentPath),
          dims
        }
      },
      (payload) => {
        if (!payload) return
        void props.annotationStore?.loadForImage(payload.relativePath, payload.dims)
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
    <div class="file-viewer bg-base-300">
      <Show
        when={props.kind()}
        fallback={
          <div class="file-viewer-empty text-base-content/60">
            <p>Select a file to preview</p>
            <span class="file-viewer-hint">Choose a file from the explorer</span>
          </div>
        }
      >
        <Switch>
          <Match when={props.error()}>
            <div class="file-viewer-empty text-error">
              <p>{props.error()}</p>
            </div>
          </Match>

          <Match when={props.kind() === 'unsupported'}>
            <div class="file-viewer-empty text-base-content/60">
              <p>Cannot render this file type</p>
              <span class="file-viewer-hint">{props.fileName()}</span>
            </div>
          </Match>

          <Match when={props.kind() === 'text' && props.filePath()}>
            <Show
              when={!props.textLoading()}
              fallback={<div class="file-viewer-empty text-primary">Loading…</div>}
            >
              <div class="file-viewer-frame file-viewer-frame--text">
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
                <div class="file-viewer-frame file-viewer-frame--image">
                  <Show when={imageError()}>
                    <div class="file-viewer-empty text-error">
                      <p>Failed to load image</p>
                    </div>
                  </Show>
                  <Show when={!imageError()}>
                    <ImageViewer
                      layers={layers()}
                      activeTool={props.activeTool}
                      labels={props.labels}
                      activeLabelId={props.activeLabelId}
                      brushSize={props.brushSize}
                      annotationStore={props.annotationStore}
                      onLoad={handleImageLoad}
                      onError={() => setImageError(true)}
                    />
                  </Show>
                  <AnnotationToolbar
                    activeTool={props.activeTool}
                    onToolChange={props.onToolChange}
                  />
                </div>
              )}
            </Show>
            <Show when={showImageLoading()}>
              <div class="file-viewer-empty text-primary">Loading…</div>
            </Show>
          </Match>
        </Switch>
      </Show>
    </div>
  )
}

export default FileViewer
