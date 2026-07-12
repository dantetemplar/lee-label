import type { Component } from 'solid-js'
import { createEffect, createSignal, on, onCleanup, onMount, Show } from 'solid-js'
import type { ImageStatus, Label, LabelDeleteStats } from '../../shared/annotations'
import { APP_DISPLAY_NAME } from '../../shared/app-name'
import { getFileKind, type FileKind } from '../../shared/file-types'
import type { ImageLayers } from '../../shared/image-layers'
import { toRelativePath } from '../../shared/paths'
import type { ProjectSettings } from '../../shared/segmentation'
import { DEFAULT_SEGMENTATION_MODE } from '../../shared/segmentation'
import type { FileEntry, RecentProject } from '../../shared/types'
import type { AnnotationTool } from './components/AnnotationToolbar'
import BrushSettings from './components/BrushSettings'
import ConfirmDialog from './components/ConfirmDialog'
import FileTree from './components/FileTree'
import FileViewer, { type FileInfo } from './components/FileViewer'
import LabelPanel from './components/LabelPanel'
import StatusBar from './components/StatusBar'
import TitleBar from './components/TitleBar'
import WelcomeScreen from './components/WelcomeScreen'
import { getActiveStore } from './lib/annotation-backend'
import { AnnotationStore } from './lib/annotation-store'
import { DEFAULT_BRUSH_DIAMETER_IMAGE_PX } from './lib/brush/constants'
import { labelIndexFromCode } from './lib/label-shortcuts'
import { ProjectContext } from './lib/project-context'
import { SemanticMapStore } from './lib/semantic-map-store'
import { getAdjacentImagePaths } from './lib/tree-nav'
import { useProjectLifecycle } from './lib/useProjectLifecycle'
import { useTextFileEditor } from './lib/useTextFileEditor'

const App: Component = () => {
  const [folderPath, setFolderPath] = createSignal<string | null>(null)
  const [folderName, setFolderName] = createSignal('Explorer')
  const [entries, setEntries] = createSignal<FileEntry[]>([])
  const [selectedPath, setSelectedPath] = createSignal<string | null>(null)
  const [selectedFile, setSelectedFile] = createSignal<FileEntry | null>(null)
  const [fileInfo, setFileInfo] = createSignal<FileInfo | null>(null)
  const [recentProjects, setRecentProjects] = createSignal<RecentProject[]>([])
  const [labels, setLabels] = createSignal<Label[]>([])
  const [activeLabelId, setActiveLabelId] = createSignal<string | null>(null)
  const [imageStatuses, setImageStatuses] = createSignal<Record<string, ImageStatus>>({})
  const [labelError, setLabelError] = createSignal<string | null>(null)
  const [labelDeletePrompt, setLabelDeletePrompt] = createSignal<{
    label: Label
    stats: LabelDeleteStats
  } | null>(null)
  const [activeTool, setActiveTool] = createSignal<AnnotationTool>('cursor')
  const [brushSize, setBrushSize] = createSignal(DEFAULT_BRUSH_DIAMETER_IMAGE_PX)
  const [shrinkBrushAtMaxZoom, setShrinkBrushAtMaxZoom] = createSignal(false)
  const [projectSettings, setProjectSettings] = createSignal<ProjectSettings>({
    name: 'Explorer',
    segmentationMode: DEFAULT_SEGMENTATION_MODE
  })

  const annotationStore = new AnnotationStore(undefined, undefined, (relativePath, status) => {
    setImageStatuses((current) => ({ ...current, [relativePath]: status }))
  })
  const semanticStore = new SemanticMapStore(undefined, undefined, (relativePath, status) => {
    setImageStatuses((current) => ({ ...current, [relativePath]: status }))
  })

  const textEditor = useTextFileEditor({
    selectedPath,
    selectedFile,
    setFileInfo
  })

  const resetViewerState = (): void => {
    setSelectedPath(null)
    setSelectedFile(null)
    setFileInfo(null)
    textEditor.resetForNavigation()
    annotationStore.clear()
    semanticStore.clear()
  }

  const flushAnnotations = async (): Promise<void> => {
    await annotationStore.flush()
    await semanticStore.flush()
  }

  const selectFile = async (node: FileEntry): Promise<void> => {
    const previousPath = selectedPath()
    const previousFile = selectedFile()

    if (node.path !== previousPath && previousFile && previousPath) {
      textEditor.saveTextSnapshot(previousPath, previousFile, textEditor.textDraft(), textEditor.textSaved())
    }

    if (node.path !== previousPath) {
      await flushAnnotations()
    }

    setSelectedPath(node.path)
    setSelectedFile(node)
    setFileInfo({
      name: node.name,
      size: node.size ?? 0
    })
  }

  const lifecycle = useProjectLifecycle({
    folderPath,
    setFolderPath,
    setFolderName,
    setEntries,
    setRecentProjects,
    setProjectSettings,
    setLabels,
    setImageStatuses,
    setActiveLabelId,
    setLabelError,
    resetViewerState,
    selectFile,
    annotationStore,
    semanticStore,
    saveOpenTextIfDirty: () => textEditor.saveOpenTextIfDirty()
  })

  onMount(() => {
    void window.api.recent.get().then(setRecentProjects)
  })

  const selectedKind = (): FileKind | null => {
    const file = selectedFile()
    return file ? getFileKind(file.name) : null
  }

  const imageLayers = (): ImageLayers | null => {
    const path = selectedPath()
    if (!path || selectedKind() !== 'image') return null

    const { prev, next } = getAdjacentImagePaths(entries(), path)
    return {
      prevPath: prev,
      currentPath: path,
      nextPath: next
    }
  }

  const loadError = (): string | null => textEditor.textLoadErrorForKind(selectedKind())

  const handleTreeFocusChange = (focusedPath: string): void => {
    const openPath = selectedPath()
    if (!openPath || focusedPath === openPath) return
    textEditor.saveOpenTextIfDirty()
  }

  const handleImageLoad = (dims: { width: number; height: number }): void => {
    const file = selectedFile()
    if (!file) return
    setFileInfo({
      name: file.name,
      size: file.size ?? 0,
      width: dims.width,
      height: dims.height,
      dirty: annotationStore.dirty[0]() || semanticStore.dirty[0]()
    })
  }

  const handleCreateLabel = async (name: string, color?: string): Promise<void> => {
    setLabelError(null)
    try {
      const label = await window.api.labels.create({ name, color })
      setLabels((current) => [...current, label])
      setActiveLabelId(label.id)
    } catch (error: unknown) {
      setLabelError(error instanceof Error ? error.message : 'Failed to create label')
    }
  }

  const handleUpdateLabel = async (label: Label): Promise<void> => {
    setLabelError(null)
    try {
      const updated = await window.api.labels.update({
        id: label.id,
        name: label.name,
        color: label.color,
        shortcut: label.shortcut
      })
      setLabels((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (error: unknown) {
      setLabelError(error instanceof Error ? error.message : 'Failed to update label')
    }
  }

  const handleRequestDeleteLabel = async (id: string): Promise<void> => {
    setLabelError(null)
    const label = labels().find((item) => item.id === id)
    if (!label) return

    try {
      const stats = await window.api.labels.getDeleteStats(id)
      setLabelDeletePrompt({ label, stats })
    } catch (error: unknown) {
      setLabelError(error instanceof Error ? error.message : 'Failed to load delete details')
    }
  }

  const handleCancelDeleteLabel = (): void => {
    setLabelDeletePrompt(null)
  }

  const handleConfirmDeleteLabel = async (): Promise<void> => {
    const prompt = labelDeletePrompt()
    if (!prompt) return

    setLabelError(null)
    const id = prompt.label.id

    try {
      await window.api.labels.delete(id)
      setLabels((current) => {
        const next = current.filter((item) => item.id !== id)
        if (activeLabelId() === id) {
          setActiveLabelId(next[0]?.id ?? null)
        }
        return next
      })

      const relativePath = currentImageRelativePath()
      const info = fileInfo()
      if (relativePath && info?.width && info?.height) {
        const store = getActiveStore(
          projectSettings().segmentationMode,
          annotationStore,
          semanticStore
        )
        await store.loadForImage(relativePath, {
          width: info.width,
          height: info.height
        })
      }

      setLabelDeletePrompt(null)
    } catch (error: unknown) {
      setLabelError(error instanceof Error ? error.message : 'Failed to delete label')
    }
  }

  const handleImageStatusChange = (relativePath: string, status: ImageStatus): void => {
    setImageStatuses((current) => ({ ...current, [relativePath]: status }))
  }

  createEffect(
    on(
      () => [imageLayers(), selectedKind()] as const,
      ([layers, kind], previous) => {
        const layersChanged = previous !== undefined && previous[0] !== layers
        if (layersChanged || kind !== 'image') {
          setActiveTool('cursor')
        }
      }
    )
  )

  const showLabelSidebar = (): boolean =>
    selectedKind() === 'image' && activeTool() !== 'cursor'

  const currentImageRelativePath = (): string | null => {
    const root = folderPath()
    const path = selectedPath()
    if (!root || !path || selectedKind() !== 'image') return null
    return toRelativePath(root, path)
  }

  const markImageStatus = (status: ImageStatus): void => {
    const store = getActiveStore(projectSettings().segmentationMode, annotationStore, semanticStore)
    void store.setImageStatus(status).then(() => {
      const relativePath = currentImageRelativePath()
      if (relativePath) handleImageStatusChange(relativePath, status)
    })
  }

  const handleMarkDone = (): void => markImageStatus('done')
  const handleMarkSkipped = (): void => markImageStatus('skipped')

  createEffect(
    on(
      () => [annotationStore.dirty[0](), semanticStore.dirty[0]()] as const,
      ([annotationDirty, semanticDirty]) => {
        setFileInfo((info) =>
          info ? { ...info, dirty: annotationDirty || semanticDirty } : info
        )
      }
    )
  )

  createEffect(
    on(
      () => projectSettings().segmentationMode,
      (mode) => {
        annotationStore.setSegmentationMode(mode)
        if (mode === 'semantic' && activeTool() === 'rectangle') {
          setActiveTool('cursor')
        }
      }
    )
  )

  createEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (isEditableTarget(event.target)) return

      if (event.key === 'Escape') {
        if (activeTool() === 'cursor') {
          if (annotationStore.selectedShapeId[0]()) {
            event.preventDefault()
            annotationStore.setSelectedShapeId(null)
          }
          return
        }
        event.preventDefault()
        setActiveTool('cursor')
        return
      }

      const tool = activeTool()
      if (tool === 'rectangle' || tool === 'mask') {
        const labelIndex = labelIndexFromCode(event.code)
        if (labelIndex !== null) {
          const label = labels()[labelIndex]
          if (label) {
            event.preventDefault()
            setActiveLabelId(label.id)
          }
          return
        }
      }

      if (tool !== 'cursor') return

      if (event.code === 'Digit1' && projectSettings().segmentationMode === 'instance') {
        event.preventDefault()
        setActiveTool('rectangle')
        return
      }

      if (event.code === 'Digit2') {
        event.preventDefault()
        setActiveTool('mask')
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown))
  })

  const handleUpdateProjectSettings = async (settings: {
    name: string
    segmentationMode: ProjectSettings['segmentationMode']
  }): Promise<void> => {
    const updated = await window.api.project.update(settings)
    setProjectSettings(updated)
    setFolderName(updated.name)
    const path = folderPath()
    if (path) {
      const recent = await window.api.recent.add(path)
      setRecentProjects(recent)
    }
  }

  const handleRemoveRecent = async (path: string): Promise<void> => {
    const recent = await window.api.recent.remove(path)
    setRecentProjects(recent)
  }

  const projectContextValue = {
    annotationStore,
    semanticStore,
    labels,
    activeLabelId,
    setActiveLabelId,
    projectSettings,
    activeTool,
    setActiveTool,
    brushSize,
    setBrushSize,
    shrinkBrushAtMaxZoom,
    setShrinkBrushAtMaxZoom
  }

  return (
    <ProjectContext.Provider value={projectContextValue}>
      <div class="app flex h-screen flex-col bg-base-100 text-base-content">
        <TitleBar
          title={() => (folderPath() ? folderName() : APP_DISPLAY_NAME)}
          hasOpenProject={() => folderPath() !== null}
          recentProjects={recentProjects}
          onGoToWelcomeScreen={() => void lifecycle.goToWelcomeScreen()}
          onOpenFolder={() => void lifecycle.openFolder()}
          onOpenRecent={(path) => void lifecycle.openRecentProject(path, setRecentProjects)}
        />
        <div class="flex min-h-0 flex-1">
          <Show when={folderPath()}>
            <Show
              when={showLabelSidebar()}
              fallback={
                <FileTree
                  rootName={folderName}
                  entries={entries}
                  selectedPath={selectedPath}
                  projectRoot={folderPath}
                  imageStatuses={imageStatuses}
                  onSelect={(node) => void selectFile(node)}
                  onFocusChange={handleTreeFocusChange}
                  onProjectSettingsChange={handleUpdateProjectSettings}
                  projectSettings={projectSettings}
                />
              }
            >
              <aside class="flex w-[var(--sidebar-width)] min-w-[var(--sidebar-width)] flex-col border-base-300 bg-base-200 border-r">
                <Show when={activeTool() === 'mask'}>
                  <BrushSettings
                    brushSize={brushSize}
                    onBrushSizeChange={setBrushSize}
                    shrinkAtMaxZoom={shrinkBrushAtMaxZoom}
                    onShrinkAtMaxZoomChange={setShrinkBrushAtMaxZoom}
                  />
                </Show>
                <LabelPanel
                  labels={labels}
                  activeLabelId={activeLabelId}
                  onSelect={setActiveLabelId}
                  onCreate={handleCreateLabel}
                  onUpdate={handleUpdateLabel}
                  onDelete={handleRequestDeleteLabel}
                  showShortcuts={() => activeTool() === 'rectangle' || activeTool() === 'mask'}
                  error={labelError}
                />
                <div class="flex shrink-0 flex-col gap-1.5 border-t border-base-content/10 p-2">
                  <button type="button" class="btn btn-sm btn-outline w-full" onClick={handleMarkDone}>
                    Mark done
                  </button>
                  <button type="button" class="btn btn-sm btn-outline w-full" onClick={handleMarkSkipped}>
                    Skip
                  </button>
                </div>
              </aside>
            </Show>
            <div class="flex min-w-0 flex-1 flex-col bg-base-100">
              <FileViewer
                kind={selectedKind}
                fileName={() => selectedFile()?.name ?? null}
                filePath={selectedPath}
                projectRoot={folderPath}
                imageLayers={imageLayers}
                textLoading={() => textEditor.textLoading()}
                error={loadError}
                onImageLoad={handleImageLoad}
                onTextChange={textEditor.setTextDraft}
                textDraft={textEditor.textDraft}
                onTextSave={textEditor.saveOpenTextIfDirty}
              />
            </div>
          </Show>
          <Show when={!folderPath()}>
            <WelcomeScreen
              recentProjects={recentProjects}
              onOpenFolder={() => void lifecycle.openFolder()}
              onOpenRecent={(path) => void lifecycle.openRecentProject(path, setRecentProjects)}
              onRemoveRecent={(path) => void handleRemoveRecent(path)}
            />
          </Show>
        </div>
        <StatusBar info={fileInfo} />
        <ConfirmDialog
          open={() => labelDeletePrompt() !== null}
          title={() => {
            const label = labelDeletePrompt()?.label
            return label ? `Do you want to delete "${label.name}" label?` : ''
          }}
          message={() => {
            const prompt = labelDeletePrompt()
            if (!prompt) return ''
            const { fileCount, instanceCount } = prompt.stats
            return (
              <>
                This action cannot be undone. All annotations ({fileCount} files, {instanceCount}{' '}
                instances) associated to the label will be deleted.
              </>
            )
          }}
          destructive
          onCancel={handleCancelDeleteLabel}
          onConfirm={() => void handleConfirmDeleteLabel()}
        />
      </div>
    </ProjectContext.Provider>
  )
}

export default App
