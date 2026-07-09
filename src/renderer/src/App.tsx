import type { Component } from 'solid-js'
import { createEffect, createSignal, on, onMount, Show, untrack } from 'solid-js'
import type { FileEntry, RecentProject } from '../../shared/types'
import { getFileKind, type FileKind } from '../../shared/file-types'
import FileTree from './components/FileTree'
import FileViewer, { type FileInfo } from './components/FileViewer'
import StatusBar from './components/StatusBar'
import TitleBar from './components/TitleBar'
import WelcomeScreen from './components/WelcomeScreen'
import type { ImageLayers } from '../../shared/image-layers'
import { getAdjacentImagePaths } from './lib/tree-nav'
import { APP_DISPLAY_NAME } from '../../shared/app-name'

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
  }

  const loadFolderAtPath = async (path: string): Promise<void> => {
    const tree = await window.api.files.readDirectoryTree(path)
    const recent = await window.api.recent.add(path)
    setFolderPath(path)
    setFolderName(path.split(/[/\\]/).pop() ?? 'Folder')
    setEntries(tree)
    setRecentProjects(recent)
    resetViewerState()
  }

  const openFolder = async (): Promise<void> => {
    saveOpenTextIfDirty()

    const path = await window.api.files.openFolder()
    if (!path) return

    await loadFolderAtPath(path)
  }

  const openRecentProject = async (path: string): Promise<void> => {
    saveOpenTextIfDirty()

    const exists = await window.api.recent.exists(path)
    if (!exists) {
      const recent = await window.api.recent.get()
      setRecentProjects(recent)
      return
    }

    await loadFolderAtPath(path)
  }

  const selectFile = (node: FileEntry): void => {
    const previousPath = selectedPath()
    const previousFile = selectedFile()

    if (node.path !== previousPath && previousFile && previousPath) {
      saveTextSnapshot(previousPath, previousFile, textDraft(), textSaved())
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
      height: dims.height
    })
  }

  return (
    <div class="app bg-base-100 text-base-content">
      <TitleBar
        title={() => (folderPath() ? folderName() : APP_DISPLAY_NAME)}
        onOpenFolder={openFolder}
      />
      <div class="app-body">
        <Show when={folderPath()}>
          <FileTree
            rootName={folderName}
            entries={entries}
            selectedPath={selectedPath}
            onSelect={selectFile}
            onFocusChange={handleTreeFocusChange}
          />
          <div class="main-panel bg-base-100">
            <FileViewer
              kind={selectedKind}
              fileName={() => selectedFile()?.name ?? null}
              filePath={selectedPath}
              imageLayers={imageLayers}
              textLoading={() => textLoading()}
              error={loadError}
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
    </div>
  )
}

export default App
