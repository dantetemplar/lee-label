import type { Component } from 'solid-js'
import { createEffect, createSignal, on, onMount, Show, untrack } from 'solid-js'
import type { FileEntry, RecentProject } from '../../shared/types'
import type { ImageStatus, Label, LabelDeleteStats } from '../../shared/annotations'
import { getFileKind, type FileKind } from '../../shared/file-types'
import FileTree from './components/FileTree'
import FileViewer, { type FileInfo } from './components/FileViewer'
import LabelPanel from './components/LabelPanel'
import BrushSettings from './components/BrushSettings'
import type { AnnotationTool } from './components/AnnotationToolbar'
import { DEFAULT_BRUSH_DIAMETER_IMAGE_PX } from './lib/brush/constants'
import StatusBar from './components/StatusBar'
import TitleBar from './components/TitleBar'
import WelcomeScreen from './components/WelcomeScreen'
import ConfirmDialog from './components/ConfirmDialog'
import type { ImageLayers } from '../../shared/image-layers'
import { getAdjacentImagePaths } from './lib/tree-nav'
import { APP_DISPLAY_NAME } from '../../shared/app-name'
import { AnnotationStore } from './lib/annotation-store'
import { toRelativePath } from './lib/project-path'

const App: Component = () => {
  const [folderPath, setFolderPath] = createSignal<string | null>(null)
  const [folderName, setFolderName] = createSignal('Explorer')
  const [entries, setEntries] = createSignal<FileEntry[]>([])
  const [selectedPath, setSelectedPath] = createSignal<string | null>(null)
  const [selectedFile, setSelectedFile] = createSignal<FileEntry | null>(null)
  const [fileInfo, setFileInfo] = createSignal<FileInfo | null>(null)
  const [textDraft, setTextDraft] = createSignal('')
  const [textSaved, setTextSaved] = createSignal('')
  const [textLoading, setTextLoading] = createSignal(false)
  const [textLoadError, setTextLoadError] = createSignal<string | null>(null)
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

  const annotationStore = new AnnotationStore(undefined, (relativePath, status) => {
    setImageStatuses((current) => ({ ...current, [relativePath]: status }))
  })

  let textLoadVersion = 0

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

  const loadError = (): string | null => {
    if (selectedKind() === 'text') return textLoadError()
    return null
  }

  const updateTextFileInfo = (file: FileEntry, content: string, dirty: boolean): void => {
    setFileInfo({
      name: file.name,
      size: new TextEncoder().encode(content).length,
      lines: content.split('\n').length,
      dirty
    })
  }

  createEffect(
    on(
      () => {
        const path = selectedPath()
        const file = selectedFile()
        if (!path || !file || getFileKind(file.name) !== 'text') return null
        return path
      },
      (path) => {
        if (!path) {
          textLoadVersion += 1
          setTextLoading(false)
          setTextLoadError(null)
          return
        }

        const file = selectedFile()
        if (!file) return

        const version = ++textLoadVersion
        setTextLoading(true)
        setTextLoadError(null)
        setTextDraft('')
        setTextSaved('')

        void window.api.files
          .readTextFile(path)
          .then((content) => {
            if (version !== textLoadVersion || untrack(selectedPath) !== path) return
            setTextDraft(content)
            setTextSaved(content)
            updateTextFileInfo(file, content, false)
            setTextLoading(false)
          })
          .catch((error: unknown) => {
            if (version !== textLoadVersion || untrack(selectedPath) !== path) return
            setTextLoadError(error instanceof Error ? error.message : 'Failed to load file')
            setTextLoading(false)
          })
      }
    )
  )

  const saveTextSnapshot = (
    path: string,
    file: FileEntry,
    content: string,
    savedContent: string
  ): void => {
    if (getFileKind(file.name) !== 'text') return
    if (content === savedContent) return

    void window.api.files.writeTextFile(path, content).then((size) => {
      if (untrack(() => selectedPath() === path && textDraft() === content)) {
        setTextSaved(content)
        setFileInfo({
          name: file.name,
          size,
          lines: content.split('\n').length,
          dirty: false
        })
      }
    })
  }

  const saveOpenTextIfDirty = (): void => {
    const file = selectedFile()
    const path = selectedPath()
    if (!file || !path || getFileKind(file.name) !== 'text') return
    saveTextSnapshot(path, file, textDraft(), textSaved())
  }

  const flushAnnotations = async (): Promise<void> => {
    await annotationStore.flush()
  }

  createEffect(
    on(
      () => textDraft(),
      (draft) => {
        const file = selectedFile()
        if (!file || getFileKind(file.name) !== 'text') return
        if (textLoading()) return

        const dirty = draft !== textSaved()
        setFileInfo((info) =>
          info
            ? {
                ...info,
                lines: draft.split('\n').length,
                size: new TextEncoder().encode(draft).length,
                dirty
              }
            : info
        )
      }
    )
  )

  const resetViewerState = (): void => {
    setSelectedPath(null)
    setSelectedFile(null)
    setFileInfo(null)
    setTextDraft('')
    setTextSaved('')
    setTextLoading(false)
    setTextLoadError(null)
    annotationStore.clear()
  }

  const openAnnotationProject = async (path: string): Promise<void> => {
    await window.api.project.open(path)
    const [nextLabels, statuses] = await Promise.all([
      window.api.labels.list(),
      window.api.images.listStatuses()
    ])
    setLabels(nextLabels)
    setImageStatuses(statuses)
    setActiveLabelId(nextLabels[0]?.id ?? null)
    setLabelError(null)
  }

  const closeAnnotationProject = async (): Promise<void> => {
    await flushAnnotations()
    await window.api.project.close()
    setLabels([])
    setImageStatuses({})
    setActiveLabelId(null)
    setLabelError(null)
  }

  const loadFolderAtPath = async (path: string): Promise<void> => {
    await closeAnnotationProject()
    const tree = await window.api.files.readDirectoryTree(path)
    const recent = await window.api.recent.add(path)
    setFolderPath(path)
    setFolderName(path.split(/[/\\]/).pop() ?? 'Folder')
    setEntries(tree)
    setRecentProjects(recent)
    resetViewerState()
    await openAnnotationProject(path)
  }

  const openFolder = async (): Promise<void> => {
    saveOpenTextIfDirty()
    await flushAnnotations()

    const path = await window.api.files.openFolder()
    if (!path) return

    await loadFolderAtPath(path)
  }

  const openRecentProject = async (path: string): Promise<void> => {
    saveOpenTextIfDirty()
    await flushAnnotations()

    const exists = await window.api.recent.exists(path)
    if (!exists) {
      const recent = await window.api.recent.get()
      setRecentProjects(recent)
      return
    }

    await loadFolderAtPath(path)
  }

  const selectFile = async (node: FileEntry): Promise<void> => {
    const previousPath = selectedPath()
    const previousFile = selectedFile()

    if (node.path !== previousPath && previousFile && previousPath) {
      saveTextSnapshot(previousPath, previousFile, textDraft(), textSaved())
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

  const handleTreeFocusChange = (focusedPath: string): void => {
    const openPath = selectedPath()
    if (!openPath || focusedPath === openPath) return
    saveOpenTextIfDirty()
  }

  const handleImageLoad = (dims: { width: number; height: number }): void => {
    const file = selectedFile()
    if (!file) return
    setFileInfo({
      name: file.name,
      size: file.size ?? 0,
      width: dims.width,
      height: dims.height,
      dirty: annotationStore.dirty[0]()
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
        await annotationStore.loadForImage(relativePath, {
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
      () => imageLayers(),
      () => setActiveTool('cursor')
    )
  )

  createEffect(
    on(
      () => selectedKind(),
      (kind) => {
        if (kind !== 'image') setActiveTool('cursor')
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

  const handleMarkDone = (): void => {
    void annotationStore.setImageStatus('done').then(() => {
      const relativePath = currentImageRelativePath()
      if (relativePath) handleImageStatusChange(relativePath, 'done')
    })
  }

  const handleMarkSkipped = (): void => {
    void annotationStore.setImageStatus('skipped').then(() => {
      const relativePath = currentImageRelativePath()
      if (relativePath) handleImageStatusChange(relativePath, 'skipped')
    })
  }

  createEffect(
    on(
      () => annotationStore.dirty[0](),
      (dirty) => {
        setFileInfo((info) => (info ? { ...info, dirty } : info))
      }
    )
  )

  return (
    <div class="app bg-base-100 text-base-content">
      <TitleBar
        title={() => (folderPath() ? folderName() : APP_DISPLAY_NAME)}
        onOpenFolder={openFolder}
      />
      <div class="app-body">
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
              />
            }
          >
            <aside class="sidebar border-base-300 bg-base-200 border-r">
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
                error={labelError}
              />
              <div class="annotation-status-actions">
                <button type="button" class="annotation-status-btn" onClick={handleMarkDone}>
                  Mark done
                </button>
                <button type="button" class="annotation-status-btn" onClick={handleMarkSkipped}>
                  Skip
                </button>
              </div>
            </aside>
          </Show>
          <div class="main-panel bg-base-100">
            <FileViewer
              kind={selectedKind}
              fileName={() => selectedFile()?.name ?? null}
              filePath={selectedPath}
              projectRoot={folderPath}
              imageLayers={imageLayers}
              textLoading={() => textLoading()}
              error={loadError}
              labels={labels}
              activeLabelId={activeLabelId}
              annotationStore={annotationStore}
              activeTool={activeTool}
              onToolChange={setActiveTool}
              brushSize={brushSize}
              shrinkBrushAtMaxZoom={shrinkBrushAtMaxZoom}
              onImageLoad={handleImageLoad}
              onTextChange={setTextDraft}
              textDraft={textDraft}
              onTextSave={saveOpenTextIfDirty}
            />
          </div>
        </Show>
        <Show when={!folderPath()}>
          <WelcomeScreen
            recentProjects={recentProjects}
            onOpenFolder={openFolder}
            onOpenRecent={(path) => void openRecentProject(path)}
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
        onCancel={handleCancelDeleteLabel}
        onConfirm={() => void handleConfirmDeleteLabel()}
      />
    </div>
  )
}

export default App
