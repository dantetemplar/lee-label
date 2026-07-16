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
import MagicStickSettings from './components/MagicStickSettings'
import ConfirmDialog from './components/ConfirmDialog'
import CursorSidebar from './components/CursorSidebar'
import DatasetNavBar, { DATASET_NAV_STEP, type DatasetNavStats } from './components/DatasetNavBar'
import ExportAnnotationsModal from './components/ExportAnnotationsModal'
import FileTree from './components/FileTree'
import FileViewer, { type FileInfo } from './components/FileViewer'
import ImportAnnotationsModal from './components/ImportAnnotationsModal'
import LabelPanel from './components/LabelPanel'
import ProjectSettingsModal from './components/ProjectSettingsModal'
import StatusBar from './components/StatusBar'
import TitleBar from './components/TitleBar'
import PlatformInfoModal from './components/PlatformInfoModal'
import WelcomeScreen from './components/WelcomeScreen'
import { getActiveStore } from './lib/annotation-backend'
import type { ImageBounds } from './lib/annotation-coords'
import { AnnotationStore } from './lib/annotation-store'
import { DEFAULT_BRUSH_DIAMETER_IMAGE_PX } from './lib/brush/constants'
import { labelIndexFromCode } from './lib/label-shortcuts'
import {
  clearPressedKeys,
  getPressedKeys,
  pressKey,
  releaseKey,
  usePressedKeys
} from './lib/pressed-keys'
import { ProjectContext, type CursorSidebarTab } from './lib/project-context'
import { SemanticMapStore } from './lib/semantic-map-store'
import { blurTextEditableOnEscape, isShortcutBlockedTarget } from './lib/shortcut-guards'
import {
  countImageStatuses,
  findFirstImageFile,
  findLastImageFile,
  findNextUnfinishedImage,
  findNodeByPath,
  getAdjacentImagePaths,
  getImageAtIndex,
  getImagePathByOffset,
  getImagePosition,
  listImageStatusesInOrder
} from './lib/tree-nav'
import { useProjectLifecycle } from './lib/useProjectLifecycle'
import { useTextFileEditor } from './lib/useTextFileEditor'
import { createWorkspaceSessionStore } from './lib/workspace-session-store'

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
  const [importModalOpen, setImportModalOpen] = createSignal(false)
  const [exportModalOpen, setExportModalOpen] = createSignal(false)
  const [projectSettingsOpen, setProjectSettingsOpen] = createSignal(false)
  const [projectSettingsMode, setProjectSettingsMode] = createSignal<'create' | 'settings'>(
    'settings'
  )
  const [platformInfoOpen, setPlatformInfoOpen] = createSignal(false)
  const [activeTool, setActiveTool] = createSignal<AnnotationTool>('cursor')
  const [toolModifierHeld, setToolModifierHeld] = createSignal(false)
  const [brushSize, setBrushSize] = createSignal(DEFAULT_BRUSH_DIAMETER_IMAGE_PX)
  const [shrinkBrushAtMaxZoom, setShrinkBrushAtMaxZoom] = createSignal(false)
  const [cursorSidebarTab, setCursorSidebarTab] = createSignal<CursorSidebarTab>('objects')
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
  const workspaceSession = createWorkspaceSessionStore()

  let focusShapeBoundsHandler: ((bounds: ImageBounds) => void) | null = null
  const registerFocusShapeBounds = (handler: ((bounds: ImageBounds) => void) | null): void => {
    focusShapeBoundsHandler = handler
  }
  const focusShapeBounds = (bounds: ImageBounds): void => {
    focusShapeBoundsHandler?.(bounds)
  }

  const requestDeleteShapes = (ids?: string[]): void => {
    const target = ids ?? annotationStore.selectedShapeIds[0]()
    if (target.length === 0) return
    annotationStore.deleteShapes(target)
  }

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

    if (node.path === previousPath) return

    if (previousFile && previousPath) {
      textEditor.saveTextSnapshot(
        previousPath,
        previousFile,
        textEditor.textDraft(),
        textEditor.textSaved()
      )
    }

    // Update selection immediately so image scrubbing stays live.
    setSelectedPath(node.path)
    setSelectedFile(node)
    setFileInfo({
      name: node.name,
      size: node.size ?? 0
    })

    const root = folderPath()
    if (root && getFileKind(node.name) === 'image') {
      workspaceSession.setLastImage(toRelativePath(root, node.path))
    }

    // Image loads call saveCurrent() before replacing store state.
    // Non-image files still need an explicit flush.
    if (getFileKind(node.name) !== 'image') {
      await flushAnnotations()
    }
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
    loadWorkspaceSession: () => workspaceSession.load(),
    flushWorkspaceSession: () => workspaceSession.flush(),
    clearWorkspaceSession: () => workspaceSession.clear(),
    getLastImageRelativePath: () => workspaceSession.getLastImageRelativePath(),
    annotationStore,
    semanticStore,
    saveOpenTextIfDirty: () => textEditor.saveOpenTextIfDirty()
  })

  const openProjectSettings = (): void => {
    setProjectSettingsMode('settings')
    setProjectSettingsOpen(true)
  }

  const handleOpenFolder = async (): Promise<void> => {
    const isNew = await lifecycle.openFolder()
    if (isNew) {
      setProjectSettingsMode('create')
      setProjectSettingsOpen(true)
    }
  }

  const handleOpenRecent = async (path: string): Promise<void> => {
    const isNew = await lifecycle.openRecentProject(path, setRecentProjects)
    if (isNew) {
      setProjectSettingsMode('create')
      setProjectSettingsOpen(true)
    }
  }

  onMount(() => {
    void window.api.recent.get().then(setRecentProjects)
  })

  onCleanup(() => {
    void workspaceSession.flush()
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
      () => selectedKind(),
      (kind) => {
        if (kind !== 'image') {
          setActiveTool('cursor')
        }
      }
    )
  )

  const showLabelSidebar = (): boolean => selectedKind() === 'image' && activeTool() !== 'cursor'

  const showCursorSidebar = (): boolean => selectedKind() === 'image' && activeTool() === 'cursor'

  const currentImageRelativePath = (): string | null => {
    const root = folderPath()
    const path = selectedPath()
    if (!root || !path || selectedKind() !== 'image') return null
    return toRelativePath(root, path)
  }

  const currentImageStatus = (): ImageStatus => {
    const relativePath = currentImageRelativePath()
    if (!relativePath) return 'todo'
    return imageStatuses()[relativePath] ?? 'todo'
  }

  const showDatasetNav = (): boolean =>
    folderPath() !== null && selectedKind() === 'image' && selectedPath() !== null

  const datasetNavStats = (): DatasetNavStats => {
    const root = folderPath()
    const path = selectedPath()
    if (!root || !path || selectedKind() !== 'image') {
      return { position: null, done: 0, skipped: 0, left: 0, total: 0, allReviewed: false }
    }

    const counts = countImageStatuses(entries(), root, imageStatuses())
    return {
      position: getImagePosition(entries(), path),
      ...counts,
      allReviewed: counts.total > 0 && counts.left === 0
    }
  }

  const goToPath = async (path: string | null): Promise<void> => {
    if (!path) return
    const node = findNodeByPath(entries(), path)
    if (node) await selectFile(node)
  }

  const goAdjacent = async (direction: 'prev' | 'next'): Promise<void> => {
    const path = selectedPath()
    if (!path) return
    const { prev, next } = getAdjacentImagePaths(entries(), path)
    await goToPath(direction === 'prev' ? prev : next)
  }

  const goStep = async (offset: number): Promise<void> => {
    const path = selectedPath()
    if (!path) return
    await goToPath(getImagePathByOffset(entries(), path, offset))
  }

  const goFirst = async (): Promise<void> => {
    const node = findFirstImageFile(entries())
    if (node) await selectFile(node)
  }

  const goLast = async (): Promise<void> => {
    const node = findLastImageFile(entries())
    if (node) await selectFile(node)
  }

  const goToIndex = (index: number): void => {
    const node = getImageAtIndex(entries(), index)
    if (!node || node.path === selectedPath()) return
    void selectFile(node)
  }

  const goNextUnfinished = async (): Promise<void> => {
    const path = selectedPath()
    const root = folderPath()
    if (!path || !root) return
    await goToPath(findNextUnfinishedImage(entries(), root, imageStatuses(), path))
  }

  const setCurrentImageStatus = async (status: ImageStatus): Promise<void> => {
    const path = selectedPath()
    const root = folderPath()
    if (!path || !root || selectedKind() !== 'image') return

    await flushAnnotations()
    const store = getActiveStore(projectSettings().segmentationMode, annotationStore, semanticStore)
    await store.setImageStatus(status)

    const relativePath = currentImageRelativePath()
    if (relativePath) handleImageStatusChange(relativePath, status)
  }

  const completeAndAdvance = async (status: ImageStatus): Promise<void> => {
    const path = selectedPath()
    const root = folderPath()
    if (!path || !root || selectedKind() !== 'image') return

    await setCurrentImageStatus(status)

    const relativePath = currentImageRelativePath()
    const updatedStatuses = {
      ...imageStatuses(),
      ...(relativePath ? { [relativePath]: status } : {})
    }

    const nextPath = findNextUnfinishedImage(entries(), root, updatedStatuses, path)
    if (!nextPath) return

    await goToPath(nextPath)
  }

  createEffect(
    on(
      () => [annotationStore.dirty[0](), semanticStore.dirty[0]()] as const,
      ([annotationDirty, semanticDirty]) => {
        setFileInfo((info) => (info ? { ...info, dirty: annotationDirty || semanticDirty } : info))
      }
    )
  )

  createEffect(
    on(
      () => projectSettings().segmentationMode,
      (mode) => {
        annotationStore.setSegmentationMode(mode)
        if (
          mode === 'semantic' &&
          (activeTool() === 'rectangle' || activeTool() === 'magic-stick')
        ) {
          setActiveTool('cursor')
        }
      }
    )
  )

  createEffect(() => {
    const blockShortcuts = (): void => {
      clearPressedKeys()
      setToolModifierHeld(false)
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || isShortcutBlockedTarget(event.target)) return
      pressKey(event.code)
    }

    const handleKeyUp = (event: KeyboardEvent): void => {
      releaseKey(event.code)
    }

    const handleFocusIn = (event: FocusEvent): void => {
      if (isShortcutBlockedTarget(event.target)) blockShortcuts()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup', handleKeyUp, true)
    document.addEventListener('focusin', handleFocusIn, true)
    window.addEventListener('blur', blockShortcuts)
    onCleanup(() => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('keyup', handleKeyUp, true)
      document.removeEventListener('focusin', handleFocusIn, true)
      window.removeEventListener('blur', blockShortcuts)
      blockShortcuts()
    })
  })

  createEffect(() => {
    let toolModifierChordUsed = false

    const resetToolModifier = (): void => {
      setToolModifierHeld(false)
      toolModifierChordUsed = false
    }

    const isToolModifierDown = (): boolean =>
      getPressedKeys().has('Backquote') || toolModifierHeld()

    const activateToolWithModifier = (event: KeyboardEvent, tool: AnnotationTool): void => {
      event.preventDefault()
      setToolModifierHeld(true)
      setActiveTool(tool)
      toolModifierChordUsed = true
    }

    const tryActivateToolWithModifier = (event: KeyboardEvent): boolean => {
      const keys = getPressedKeys()
      if (keys.has('Digit1') && projectSettings().segmentationMode === 'instance') {
        activateToolWithModifier(event, 'rectangle')
        return true
      }

      if (keys.has('Digit2')) {
        activateToolWithModifier(event, 'mask')
        return true
      }

      if (keys.has('Digit3') && projectSettings().segmentationMode === 'instance') {
        activateToolWithModifier(event, 'magic-stick')
        return true
      }

      return false
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (blurTextEditableOnEscape(event)) return
      if (event.defaultPrevented || isShortcutBlockedTarget(event.target)) return

      const isImage = selectedKind() === 'image' && selectedPath() !== null

      if (isImage) {
        if (event.key === '[' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault()
          void goAdjacent('prev')
          return
        }

        if (event.key === ']' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault()
          void goAdjacent('next')
          return
        }

        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          void completeAndAdvance(event.shiftKey ? 'skipped' : 'done')
          return
        }
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return

      if (event.code === 'Backquote') {
        if (!event.repeat) {
          setToolModifierHeld(true)
          toolModifierChordUsed = false
          if (tryActivateToolWithModifier(event)) return
        }
        event.preventDefault()
        return
      }

      if (isToolModifierDown()) {
        if (event.code === 'Digit1' && projectSettings().segmentationMode === 'instance') {
          activateToolWithModifier(event, 'rectangle')
          return
        }

        if (event.code === 'Digit2') {
          activateToolWithModifier(event, 'mask')
          return
        }

        if (event.code === 'Digit3' && projectSettings().segmentationMode === 'instance') {
          activateToolWithModifier(event, 'magic-stick')
          return
        }
      }

      const tool = activeTool()
      if (tool === 'rectangle' || tool === 'mask' || tool === 'magic-stick') {
        const labelIndex = labelIndexFromCode(event.code)
        if (labelIndex !== null) {
          if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') {
            queueMicrotask(() => {
              if (
                toolModifierChordUsed ||
                getPressedKeys().has('Backquote') ||
                isShortcutBlockedTarget(document.activeElement)
              ) {
                return
              }
              const label = labels()[labelIndex]
              if (label) setActiveLabelId(label.id)
            })
            return
          }

          const label = labels()[labelIndex]
          if (label) {
            event.preventDefault()
            setActiveLabelId(label.id)
          }
        }
      }
    }

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== 'Backquote') return
      if (isShortcutBlockedTarget(event.target)) {
        resetToolModifier()
        return
      }

      if (!toolModifierChordUsed) {
        if (activeTool() === 'cursor') {
          if (annotationStore.hasSelection()) {
            annotationStore.clearSelection()
          }
        } else {
          setActiveTool('cursor')
        }
      }

      resetToolModifier()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', resetToolModifier)
    onCleanup(() => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', resetToolModifier)
    })
  })

  const pressedKeys = usePressedKeys()

  const handleUpdateProjectSettings = async (settings: {
    name: string
    segmentationMode: ProjectSettings['segmentationMode']
    labels: Label[]
  }): Promise<void> => {
    const settingsChanged =
      settings.name !== projectSettings().name ||
      settings.segmentationMode !== projectSettings().segmentationMode
    if (settingsChanged) {
      const updated = await window.api.project.update({
        name: settings.name,
        segmentationMode: settings.segmentationMode
      })
      setProjectSettings(updated)
      setFolderName(updated.name)
      const path = folderPath()
      if (path) {
        const recent = await window.api.recent.add(path)
        setRecentProjects(recent)
      }
    }

    const baseline = labels()
    const draftById = new Map(settings.labels.map((label) => [label.id, label]))
    const baselineById = new Map(baseline.map((label) => [label.id, label]))

    const toDelete = baseline.filter((label) => !draftById.has(label.id)).map((label) => label.id)
    const toUpdate = settings.labels.filter((label) => {
      if (label.id.startsWith('draft:')) return false
      const prev = baselineById.get(label.id)
      if (!prev) return false
      return (
        prev.name !== label.name ||
        prev.color !== label.color ||
        (prev.shortcut ?? undefined) !== (label.shortcut ?? undefined)
      )
    })
    const toCreate = settings.labels.filter((label) => label.id.startsWith('draft:'))

    for (const id of toDelete) {
      await window.api.labels.delete(id)
    }
    for (const label of toUpdate) {
      await window.api.labels.update({
        id: label.id,
        name: label.name,
        color: label.color,
        shortcut: label.shortcut
      })
    }
    for (const label of toCreate) {
      await window.api.labels.create({
        name: label.name,
        color: label.color,
        shortcut: label.shortcut
      })
    }

    if (toDelete.length > 0 || toUpdate.length > 0 || toCreate.length > 0) {
      const nextLabels = await window.api.labels.list()
      setLabels(nextLabels)
      if (!nextLabels.some((label) => label.id === activeLabelId())) {
        setActiveLabelId(nextLabels[0]?.id ?? null)
      }

      if (toDelete.length > 0) {
        const relativePath = currentImageRelativePath()
        const info = fileInfo()
        if (relativePath && info?.width && info?.height) {
          const store = getActiveStore(settings.segmentationMode, annotationStore, semanticStore)
          await store.loadForImage(relativePath, {
            width: info.width,
            height: info.height
          })
        }
      }
    }
  }

  const handleRemoveRecent = async (path: string): Promise<void> => {
    const recent = await window.api.recent.remove(path)
    setRecentProjects(recent)
  }

  const openImportModal = async (): Promise<void> => {
    if (!folderPath()) return
    await flushAnnotations()
    setImportModalOpen(true)
  }

  const openExportModal = async (): Promise<void> => {
    if (!folderPath()) return
    await flushAnnotations()
    setExportModalOpen(true)
  }

  const handleImported = async (): Promise<void> => {
    const [nextLabels, statuses] = await Promise.all([
      window.api.labels.list(),
      window.api.images.listStatuses()
    ])
    setLabels(nextLabels)
    setImageStatuses(statuses)
    if (!activeLabelId() && nextLabels[0]) {
      setActiveLabelId(nextLabels[0].id)
    }

    const relativePath = annotationStore.currentRelativePath[0]()
    const dims = annotationStore.getImageDimensions()
    if (relativePath && dims.width > 0 && dims.height > 0) {
      if (projectSettings().segmentationMode === 'semantic') {
        await semanticStore.loadForImage(relativePath, dims)
      } else {
        await annotationStore.loadForImage(relativePath, dims)
      }
    }
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
    toolModifierHeld,
    pressedKeys,
    brushSize,
    setBrushSize,
    shrinkBrushAtMaxZoom,
    setShrinkBrushAtMaxZoom,
    cursorSidebarTab,
    setCursorSidebarTab,
    focusShapeBounds,
    registerFocusShapeBounds,
    requestDeleteShapes
  }

  return (
    <ProjectContext.Provider value={projectContextValue}>
      <div class="app flex h-screen flex-col bg-base-100 text-base-content">
        <TitleBar
          title={() => (folderPath() ? folderName() : APP_DISPLAY_NAME)}
          hasOpenProject={() => folderPath() !== null}
          recentProjects={recentProjects}
          onGoToWelcomeScreen={() => void lifecycle.goToWelcomeScreen()}
          onOpenFolder={() => void handleOpenFolder()}
          onOpenRecent={(path) => void handleOpenRecent(path)}
          onProjectSettings={openProjectSettings}
          onImportAnnotations={() => void openImportModal()}
          onExportDataset={() => void openExportModal()}
          onPlatformInfo={() => setPlatformInfoOpen(true)}
        />
        <div class="flex min-h-0 flex-1">
          <Show when={folderPath()}>
            <Show
              when={showLabelSidebar()}
              fallback={
                <Show
                  when={showCursorSidebar()}
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
                  <CursorSidebar
                    rootName={folderName}
                    entries={entries}
                    selectedPath={selectedPath}
                    projectRoot={folderPath}
                    imageStatuses={imageStatuses}
                    onSelectFile={(node) => void selectFile(node)}
                    onTreeFocusChange={handleTreeFocusChange}
                    labels={labels}
                    activeLabelId={activeLabelId}
                    onSelectLabel={setActiveLabelId}
                    onCreateLabel={handleCreateLabel}
                    onUpdateLabel={handleUpdateLabel}
                    onDeleteLabel={handleRequestDeleteLabel}
                    labelError={labelError}
                  />
                </Show>
              }
            >
              <aside class="flex w-[var(--sidebar-width)] min-w-[var(--sidebar-width)] flex-col border-base-300 bg-base-200 border-r">
                <Show when={activeTool() === 'rectangle'}>
                  <section class="shrink-0 border-b border-base-content/10">
                    <div class="px-3 pt-2.5 pb-2 text-[11px] font-semibold tracking-wide text-base-content/60">
                      RECTANGLE
                    </div>
                  </section>
                </Show>
                <Show when={activeTool() === 'mask'}>
                  <BrushSettings
                    brushSize={brushSize}
                    onBrushSizeChange={setBrushSize}
                    shrinkAtMaxZoom={shrinkBrushAtMaxZoom}
                    onShrinkAtMaxZoomChange={setShrinkBrushAtMaxZoom}
                  />
                </Show>
                <Show when={activeTool() === 'magic-stick'}>
                  <MagicStickSettings />
                </Show>
                <LabelPanel
                  labels={labels}
                  activeLabelId={activeLabelId}
                  onSelect={setActiveLabelId}
                  onCreate={handleCreateLabel}
                  onUpdate={handleUpdateLabel}
                  onDelete={handleRequestDeleteLabel}
                  showShortcuts={() =>
                    activeTool() === 'rectangle' ||
                    activeTool() === 'mask' ||
                    activeTool() === 'magic-stick'
                  }
                  error={labelError}
                />
              </aside>
            </Show>
            <div class="relative flex min-w-0 flex-1 flex-col bg-base-100">
              <FileViewer
                kind={selectedKind}
                fileName={() => selectedFile()?.name ?? null}
                filePath={selectedPath}
                projectRoot={folderPath}
                imageLayers={imageLayers}
                textLoading={() => textEditor.textLoading()}
                error={loadError}
                showProgressStrip={showDatasetNav}
                progressStats={datasetNavStats}
                progressStatuses={() => {
                  const root = folderPath()
                  if (!root) return []
                  return listImageStatusesInOrder(entries(), root, imageStatuses())
                }}
                onProgressSeek={goToIndex}
                onImageLoad={handleImageLoad}
                onTextChange={textEditor.setTextDraft}
                textDraft={textEditor.textDraft}
                onTextSave={textEditor.saveOpenTextIfDirty}
              />
              <Show when={showDatasetNav()}>
                <DatasetNavBar
                  stats={datasetNavStats}
                  currentStatus={currentImageStatus}
                  entries={entries}
                  projectRoot={folderPath}
                  onSelectFile={(node) => void selectFile(node)}
                  onFirst={() => void goFirst()}
                  onStepBack={() => void goStep(-DATASET_NAV_STEP)}
                  onPrev={() => void goAdjacent('prev')}
                  onPlay={() => void goNextUnfinished()}
                  onNext={() => void goAdjacent('next')}
                  onStepForward={() => void goStep(DATASET_NAV_STEP)}
                  onLast={() => void goLast()}
                  onClear={() => void setCurrentImageStatus('todo')}
                  onInProgress={() => void setCurrentImageStatus('in_progress')}
                  onSkip={() => void completeAndAdvance('skipped')}
                  onDone={() => void completeAndAdvance('done')}
                />
              </Show>
            </div>
          </Show>
          <Show when={!folderPath()}>
            <WelcomeScreen
              recentProjects={recentProjects}
              onOpenFolder={() => void handleOpenFolder()}
              onOpenRecent={(path) => void handleOpenRecent(path)}
              onRemoveRecent={(path) => void handleRemoveRecent(path)}
            />
          </Show>
        </div>
        <StatusBar
          info={fileInfo}
          imagePosition={() => (showDatasetNav() ? datasetNavStats().position : null)}
        />
        <ProjectSettingsModal
          open={projectSettingsOpen}
          mode={projectSettingsMode}
          projectSettings={projectSettings}
          projectPath={folderPath}
          labels={labels}
          onClose={() => setProjectSettingsOpen(false)}
          onSave={handleUpdateProjectSettings}
        />
        <PlatformInfoModal open={platformInfoOpen} onClose={() => setPlatformInfoOpen(false)} />
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
        <ImportAnnotationsModal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          onImported={() => handleImported()}
        />
        <ExportAnnotationsModal open={exportModalOpen} onClose={() => setExportModalOpen(false)} />
      </div>
    </ProjectContext.Provider>
  )
}

export default App
