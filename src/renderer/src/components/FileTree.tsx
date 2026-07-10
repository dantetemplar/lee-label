import type { Component } from 'solid-js'
import { For, Show, createEffect, createSignal, on, onCleanup } from 'solid-js'
import type { FileEntry } from '../../../shared/types'
import type { ImageStatus } from '../../../shared/annotations'
import { getFileKind } from '../../../shared/file-types'
import { toRelativePath } from '../lib/project-path'
import {
  flattenVisibleTree,
  findNodeByPath,
  findParentPath,
  getDefaultExpandedPaths
} from '../lib/tree-nav'

const TREE_ROW_HEIGHT = 22

const Chevron: Component<{ expanded: boolean }> = (props) => (
  <svg
    class="tree-chevron text-base-content/50"
    classList={{ 'tree-chevron--expanded': props.expanded }}
    width="16"
    height="16"
    viewBox="0 0 16 16"
  >
    <path d="M6 4L10 8L6 12" fill="none" stroke="currentColor" stroke-width="1.2" />
  </svg>
)

const FolderIcon: Component = () => (
  <svg width="16" height="16" viewBox="0 0 16 16">
    <path
      d="M2 3C2 2.45 2.45 2 3 2H6L8 4H13C13.55 4 14 4.45 14 5V13C14 13.55 13.55 14 13 14H3C2.45 14 2 13.55 2 13V3Z"
      fill="currentColor"
      opacity="0.85"
    />
  </svg>
)

const ImageFileIcon: Component = () => (
  <svg width="16" height="16" viewBox="0 0 16 16">
    <rect
      x="2"
      y="3"
      width="12"
      height="10"
      rx="1"
      fill="none"
      stroke="currentColor"
      stroke-width="1"
    />
    <circle cx="6" cy="7" r="1.5" fill="currentColor" />
    <path d="M2 11L5.5 8L8 10L11 7L14 10" stroke="currentColor" stroke-width="1" />
  </svg>
)

const TextFileIcon: Component = () => (
  <svg width="16" height="16" viewBox="0 0 16 16">
    <path
      d="M4 2h5l3 3v9c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1V3c0-.55.45-1 1-1z"
      fill="none"
      stroke="currentColor"
      stroke-width="1"
    />
    <path d="M9 2v3h3" fill="none" stroke="currentColor" stroke-width="1" />
    <path d="M5 8h6M5 10h6M5 12h4" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
  </svg>
)

const GenericFileIcon: Component = () => (
  <svg width="16" height="16" viewBox="0 0 16 16">
    <path
      d="M4 2h5l3 3v9c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1V3c0-.55.45-1 1-1z"
      fill="none"
      stroke="currentColor"
      stroke-width="1"
    />
    <path d="M9 2v3h3" fill="none" stroke="currentColor" stroke-width="1" />
  </svg>
)

const FileIcon: Component<{ name: string }> = (props) => (
  <Show
    when={getFileKind(props.name) === 'image'}
    fallback={
      <Show when={getFileKind(props.name) === 'text'} fallback={<GenericFileIcon />}>
        <TextFileIcon />
      </Show>
    }
  >
    <ImageFileIcon />
  </Show>
)

const TreeNode: Component<{
  node: FileEntry
  depth: number
  expandedPaths: () => Set<string>
  selectedPath: () => string | null
  focusedPath: () => string | null
  projectRoot: () => string | null
  imageStatuses: () => Record<string, ImageStatus>
  onToggleExpand: (path: string) => void
  onFocus: (node: FileEntry) => void
  onSelect: (node: FileEntry) => void
  focusTree: () => void
}> = (props) => {
  const isExpanded = (): boolean =>
    props.node.type === 'directory' && props.expandedPaths().has(props.node.path)

  const isSelected = (): boolean =>
    props.node.type === 'file' && props.selectedPath() === props.node.path

  const isFocused = (): boolean => props.focusedPath() === props.node.path

  const handleClick = (): void => {
    props.onFocus(props.node)
    if (props.node.type === 'directory') {
      props.onToggleExpand(props.node.path)
    } else {
      props.onSelect(props.node)
    }
  }

  const imageStatus = (): ImageStatus | null => {
    const root = props.projectRoot()
    if (!root || props.node.type !== 'file' || getFileKind(props.node.name) !== 'image') return null
    return props.imageStatuses()[toRelativePath(root, props.node.path)] ?? 'todo'
  }

  const statusClass = (): string | undefined => {
    const status = imageStatus()
    if (!status || status === 'todo') return undefined
    return `tree-status--${status}`
  }

  return (
    <>
      <button
        type="button"
        class="tree-item text-base-content"
        data-path={props.node.path}
        classList={{
          'tree-item--selected': isSelected(),
          'tree-item--focused': isFocused(),
          'tree-item--sticky': isExpanded()
        }}
        style={{
          'padding-left': `${8 + props.depth * 16}px`,
          top: isExpanded() ? `${props.depth * TREE_ROW_HEIGHT}px` : undefined,
          'z-index': isExpanded() ? props.depth + 1 : undefined
        }}
        onClick={handleClick}
        onMouseDown={(event) => {
          event.preventDefault()
          props.focusTree()
        }}
      >
        <Show when={props.node.type === 'directory'}>
          <Chevron expanded={isExpanded()} />
        </Show>
        <Show when={props.node.type === 'file'}>
          <span class="tree-chevron-spacer" />
        </Show>
        <span class="tree-item-icon text-base-content/45">
          <Show
            when={props.node.type === 'directory'}
            fallback={<FileIcon name={props.node.name} />}
          >
            <FolderIcon />
          </Show>
        </span>
        <span class="tree-item-label">{props.node.name}</span>
        <Show when={imageStatus() && imageStatus() !== 'todo'}>
          <span class={`tree-status ${statusClass() ?? ''}`} />
        </Show>
      </button>
      <Show when={props.node.type === 'directory' && isExpanded() && props.node.children}>
        <For each={props.node.children}>
          {(child) => (
            <TreeNode
              node={child}
              depth={props.depth + 1}
              expandedPaths={props.expandedPaths}
              selectedPath={props.selectedPath}
              focusedPath={props.focusedPath}
              projectRoot={props.projectRoot}
              imageStatuses={props.imageStatuses}
              onToggleExpand={props.onToggleExpand}
              onFocus={props.onFocus}
              onSelect={props.onSelect}
              focusTree={props.focusTree}
            />
          )}
        </For>
      </Show>
    </>
  )
}

const FileTree: Component<{
  rootName: () => string
  entries: () => FileEntry[]
  selectedPath: () => string | null
  projectRoot: () => string | null
  imageStatuses: () => Record<string, ImageStatus>
  onSelect: (node: FileEntry) => void
  onFocusChange?: (path: string) => void
}> = (props) => {
  let treeRef: HTMLDivElement | undefined
  const [expandedPaths, setExpandedPaths] = createSignal<Set<string>>(new Set())
  const [focusedPath, setFocusedPath] = createSignal<string | null>(null)

  createEffect(() => {
    const entries = props.entries()
    setExpandedPaths(getDefaultExpandedPaths(entries))
    setFocusedPath(null)
  })

  createEffect(
    on(
      () => props.selectedPath(),
      (selected, previous) => {
        if (selected && selected !== previous) {
          setFocusedPath(selected)
        }
      }
    )
  )

  const focusTree = (): void => {
    treeRef?.focus()
  }

  const expandFolder = (path: string): void => {
    setExpandedPaths((prev) => new Set(prev).add(path))
  }

  const collapseFolder = (path: string): void => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      next.delete(path)
      return next
    })
  }

  const toggleExpanded = (path: string): void => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const getVisibleNodes = (): FileEntry[] => flattenVisibleTree(props.entries(), expandedPaths())

  const setNodeFocus = (
    node: FileEntry,
    options: { scroll?: boolean; select?: boolean } = {}
  ): void => {
    const previous = getActivePath()
    setFocusedPath(node.path)
    if (options.scroll) scrollToPath(node.path)
    if (previous !== node.path) {
      props.onFocusChange?.(node.path)
    }
    if (options.select && node.type === 'file') {
      props.onSelect(node)
    }
  }

  const focusNode = (node: FileEntry): void => {
    setNodeFocus(node)
  }

  const selectNode = (node: FileEntry): void => {
    setNodeFocus(node, { select: true })
  }

  const scrollToPath = (path: string): void => {
    const el = treeRef?.querySelector(`[data-path="${CSS.escape(path)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }

  const getActivePath = (): string | null => focusedPath() ?? props.selectedPath()

  const getActiveNode = (): FileEntry | null => {
    const current = getActivePath()
    if (!current) return null
    return findNodeByPath(props.entries(), current)
  }

  const isFolderActive = (): boolean => getActiveNode()?.type === 'directory'

  const focusNodeAt = (node: FileEntry): void => {
    setNodeFocus(node, { scroll: true, select: node.type === 'file' })
  }

  const moveFocus = (direction: 1 | -1): void => {
    const visible = getVisibleNodes()
    if (visible.length === 0) return

    const currentPath = getActivePath()
    let index = currentPath ? visible.findIndex((node) => node.path === currentPath) : -1

    if (direction === 1) {
      index = index < visible.length - 1 ? index + 1 : 0
    } else {
      index = index > 0 ? index - 1 : visible.length - 1
    }

    focusNodeAt(visible[index])
  }

  const handleArrowRight = (): void => {
    const node = getActiveNode()
    if (!node || node.type !== 'directory') return

    const current = node.path

    if (!expandedPaths().has(node.path)) {
      expandFolder(node.path)
      return
    }

    const visible = getVisibleNodes()
    const index = visible.findIndex((item) => item.path === current)
    if (index >= 0 && index < visible.length - 1) {
      focusNodeAt(visible[index + 1])
    }
  }

  const handleArrowLeft = (): void => {
    const node = getActiveNode()
    if (!node || node.type !== 'directory') return

    const current = node.path

    if (expandedPaths().has(node.path)) {
      collapseFolder(node.path)
      return
    }

    const parentPath = findParentPath(props.entries(), current)
    if (!parentPath) return

    const parent = findNodeByPath(props.entries(), parentPath)
    if (parent) focusNodeAt(parent)
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(-1)
      return
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      if (!isFolderActive()) return

      event.preventDefault()
      if (event.key === 'ArrowRight') handleArrowRight()
      else handleArrowLeft()
    }
  }

  const handleTreeFocus = (): void => {
    if (focusedPath() || props.selectedPath()) return

    const visible = getVisibleNodes()
    const first = visible[0]
    if (!first) return

    setFocusedPath(first.path)
    if (first.type === 'file') props.onSelect(first)
  }

  onCleanup(() => {
    treeRef = undefined
  })

  return (
    <aside class="sidebar border-base-300 bg-base-200 border-r">
      <div class="sidebar-header text-base-content/60">{props.rootName().toUpperCase()}</div>
      <div
        ref={treeRef}
        class="sidebar-tree outline-none focus:outline-none"
        tabindex={0}
        onKeyDown={handleKeyDown}
        onFocus={handleTreeFocus}
        onMouseDown={(event) => {
          if (event.target === treeRef) event.preventDefault()
          treeRef?.focus()
        }}
      >
        <Show
          when={props.entries().length > 0}
          fallback={<div class="sidebar-empty text-base-content/60">No files found</div>}
        >
          <For each={props.entries()}>
            {(node) => (
              <TreeNode
                node={node}
                depth={0}
                expandedPaths={expandedPaths}
                selectedPath={props.selectedPath}
                focusedPath={focusedPath}
                projectRoot={props.projectRoot}
                imageStatuses={props.imageStatuses}
                onToggleExpand={toggleExpanded}
                onFocus={focusNode}
                onSelect={selectNode}
                focusTree={focusTree}
              />
            )}
          </For>
        </Show>
      </div>
    </aside>
  )
}

export default FileTree
