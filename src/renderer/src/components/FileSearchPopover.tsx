import { BsFileEarmark, BsFileEarmarkImage, BsFileEarmarkText, BsSearch } from 'solid-icons/bs'
import type { Component } from 'solid-js'
import { For, Show, createEffect, createMemo, createSignal, on } from 'solid-js'
import type { FileEntry } from '../../../shared/types'
import { getFileKind } from '../../../shared/file-types'
import { toRelativePath } from '../../../shared/paths'
import { searchWorkspaceFiles } from '../lib/tree-nav'
import FloatingPopover from './FloatingPopover'

const RESULT_ICON_SIZE = 16

const SearchFileIcon: Component<{ name: string }> = (props) => (
  <Show
    when={getFileKind(props.name) === 'image'}
    fallback={
      <Show
        when={getFileKind(props.name) === 'text'}
        fallback={<BsFileEarmark size={RESULT_ICON_SIZE} aria-hidden="true" />}
      >
        <BsFileEarmarkText size={RESULT_ICON_SIZE} aria-hidden="true" />
      </Show>
    }
  >
    <BsFileEarmarkImage size={RESULT_ICON_SIZE} aria-hidden="true" />
  </Show>
)

const FileSearchPopover: Component<{
  entries: () => FileEntry[]
  projectRoot: () => string | null
  iconSize: number
  onSelectFile: (node: FileEntry) => void
}> = (props) => {
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal('')
  const [highlightIndex, setHighlightIndex] = createSignal(0)
  let buttonRef: HTMLButtonElement | undefined
  let inputRef: HTMLInputElement | undefined
  let resultsRef: HTMLDivElement | undefined

  const results = createMemo(() => {
    const root = props.projectRoot()
    if (!root) return []
    return searchWorkspaceFiles(props.entries(), root, query())
  })

  const close = (): void => {
    setOpen(false)
    setQuery('')
    setHighlightIndex(0)
  }

  const selectFile = (file: FileEntry): void => {
    props.onSelectFile(file)
    close()
  }

  createEffect(
    on(query, () => {
      setHighlightIndex(0)
    })
  )

  createEffect(
    on(open, (isOpen) => {
      if (!isOpen) return
      queueMicrotask(() => {
        inputRef?.focus()
        inputRef?.select()
      })
    })
  )

  createEffect(
    on(highlightIndex, (index) => {
      const item = resultsRef?.querySelector<HTMLElement>(`[data-search-index="${index}"]`)
      item?.scrollIntoView({ block: 'nearest' })
    })
  )

  const moveHighlight = (delta: number): void => {
    const count = results().length
    if (count === 0) {
      setHighlightIndex(0)
      return
    }
    setHighlightIndex((index) => (index + delta + count) % count)
  }

  return (
    <>
      <div class="pointer-events-auto flex items-center rounded-box border border-base-300 bg-base-100/95 px-0.5 shadow-md backdrop-blur-sm">
        <span class="inline-flex" title="Search files">
          <button
            ref={buttonRef}
            type="button"
            class="btn btn-ghost btn-square flex h-7 min-h-7 w-7 min-w-7 items-center justify-center p-0 text-base-content"
            aria-label="Search files"
            aria-haspopup="dialog"
            aria-expanded={open()}
            onClick={() => setOpen((value) => !value)}
          >
            <BsSearch size={props.iconSize} aria-hidden="true" />
          </button>
        </span>
      </div>

      <FloatingPopover
        open={open}
        onClose={close}
        reference={() => buttonRef}
        placement="top-start"
        fitContent={false}
        contentRole="dialog"
        panelClass="w-80 max-w-[min(20rem,calc(100vw-1.5rem))] p-2"
      >
        <div class="flex w-full items-center gap-2 rounded-lg border border-base-content/10 bg-base-100 px-2.5 py-1.5 focus-within:border-base-content/20 focus-within:ring-1 focus-within:ring-primary/40">
          <BsSearch size={14} class="shrink-0 text-base-content/45" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="searchbox"
            class="grow border-0 bg-transparent p-0 text-sm outline-none focus:outline-none focus:ring-0"
            placeholder="Search files..."
            value={query()}
            aria-label="Search files"
            aria-controls="file-search-results"
            aria-activedescendant={
              results().length > 0 ? `file-search-option-${highlightIndex()}` : undefined
            }
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                moveHighlight(1)
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                moveHighlight(-1)
                return
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                const file = results()[highlightIndex()]
                if (file) selectFile(file)
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                close()
              }
            }}
          />
        </div>

        <div ref={resultsRef} id="file-search-results" class="mt-2 max-h-64 overflow-y-auto">
          <Show
            when={query().trim().length > 0}
            fallback={
              <div class="px-2 py-3 text-sm text-base-content/50">Type to search project files</div>
            }
          >
            <Show
              when={results().length > 0}
              fallback={<div class="px-2 py-3 text-sm text-base-content/50">No matching files</div>}
            >
              <ul class="menu menu-sm p-0" role="listbox" aria-label="Search results">
                <For each={results()}>
                  {(file, index) => {
                    const root = props.projectRoot()
                    const relativePath = (): string =>
                      root ? toRelativePath(root, file.path) : file.path

                    return (
                      <li>
                        <button
                          type="button"
                          id={`file-search-option-${index()}`}
                          data-search-index={index()}
                          role="option"
                          aria-selected={highlightIndex() === index()}
                          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
                          classList={{
                            'bg-base-200': highlightIndex() === index()
                          }}
                          onMouseEnter={() => setHighlightIndex(index())}
                          onClick={() => selectFile(file)}
                        >
                          <span class="shrink-0 text-base-content/45">
                            <SearchFileIcon name={file.name} />
                          </span>
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm text-base-content">
                              {file.name}
                            </span>
                            <span class="block truncate text-xs text-base-content/45">
                              {relativePath()}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  }}
                </For>
              </ul>
            </Show>
          </Show>
        </div>
      </FloatingPopover>
    </>
  )
}

export default FileSearchPopover
