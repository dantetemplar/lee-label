import { createEffect, createSignal, on, untrack } from 'solid-js'
import type { FileEntry } from '../../../shared/types'
import type { FileKind } from '../../../shared/file-types'
import { getFileKind } from '../../../shared/file-types'
import type { FileInfo } from '../components/FileViewer'

export function useTextFileEditor(options: {
  selectedPath: () => string | null
  selectedFile: () => FileEntry | null
  setFileInfo: (info: FileInfo | null | ((info: FileInfo | null) => FileInfo | null)) => void
}): {
  textDraft: () => string
  setTextDraft: (value: string) => void
  textSaved: () => string
  textLoading: () => boolean
  textLoadError: () => string | null
  saveOpenTextIfDirty: () => void
  saveTextSnapshot: (path: string, file: FileEntry, content: string, savedContent: string) => void
  textLoadErrorForKind: (kind: FileKind | null) => string | null
  resetForNavigation: () => void
} {
  const [textDraft, setTextDraft] = createSignal('')
  const [textSaved, setTextSaved] = createSignal('')
  const [textLoading, setTextLoading] = createSignal(false)
  const [textLoadError, setTextLoadError] = createSignal<string | null>(null)

  let textLoadVersion = 0

  const updateTextFileInfo = (file: FileEntry, content: string, dirty: boolean): void => {
    options.setFileInfo({
      name: file.name,
      size: new TextEncoder().encode(content).length,
      lines: content.split('\n').length,
      dirty
    })
  }

  createEffect(
    on(
      () => {
        const path = options.selectedPath()
        const file = options.selectedFile()
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

        const file = options.selectedFile()
        if (!file) return

        const version = ++textLoadVersion
        setTextLoading(true)
        setTextLoadError(null)
        setTextDraft('')
        setTextSaved('')

        void window.api.files
          .readTextFile(path)
          .then((content) => {
            if (version !== textLoadVersion || untrack(options.selectedPath) !== path) return
            setTextDraft(content)
            setTextSaved(content)
            updateTextFileInfo(file, content, false)
            setTextLoading(false)
          })
          .catch((error: unknown) => {
            if (version !== textLoadVersion || untrack(options.selectedPath) !== path) return
            setTextLoadError(error instanceof Error ? error.message : 'Failed to load file')
            setTextLoading(false)
          })
      }
    )
  )

  createEffect(
    on(
      () => textDraft(),
      (draft) => {
        const file = options.selectedFile()
        if (!file || getFileKind(file.name) !== 'text') return
        if (textLoading()) return

        const dirty = draft !== textSaved()
        options.setFileInfo((info) =>
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

  const saveTextSnapshot = (
    path: string,
    file: FileEntry,
    content: string,
    savedContent: string
  ): void => {
    if (getFileKind(file.name) !== 'text') return
    if (content === savedContent) return

    void window.api.files.writeTextFile(path, content).then((size) => {
      if (untrack(() => options.selectedPath() === path && textDraft() === content)) {
        setTextSaved(content)
        options.setFileInfo({
          name: file.name,
          size,
          lines: content.split('\n').length,
          dirty: false
        })
      }
    })
  }

  const saveOpenTextIfDirty = (): void => {
    const file = options.selectedFile()
    const path = options.selectedPath()
    if (!file || !path || getFileKind(file.name) !== 'text') return
    saveTextSnapshot(path, file, textDraft(), textSaved())
  }

  const textLoadErrorForKind = (kind: FileKind | null): string | null => {
    if (kind === 'text') return textLoadError()
    return null
  }

  const resetForNavigation = (): void => {
    textLoadVersion += 1
    setTextDraft('')
    setTextSaved('')
    setTextLoading(false)
    setTextLoadError(null)
  }

  return {
    textDraft,
    setTextDraft,
    textSaved,
    textLoading,
    textLoadError,
    saveOpenTextIfDirty,
    saveTextSnapshot,
    textLoadErrorForKind,
    resetForNavigation
  }
}
