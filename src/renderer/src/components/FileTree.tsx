import type { Component } from 'solid-js'
import { For, Show, createEffect, createSignal, on, onCleanup } from 'solid-js'
import {
  BsChevronRight,
  BsFileEarmark,
  BsFileEarmarkImage,
  BsFileEarmarkText,
  BsFolderFill
} from 'solid-icons/bs'
import type { FileEntry } from '../../../shared/types'
import type { ImageStatus } from '../../../shared/annotations'
import { getFileKind } from '../../../shared/file-types'
import { toRelativePath } from '../../../shared/paths'
import {
  flattenVisibleTree,
  findNodeByPath,
  findParentPath,
  getDefaultExpandedPaths
} from '../lib/tree-nav'

const TREE_ROW_HEIGHT = 22
const TREE_ICON_SIZE = 16

const treeItemBaseClass =
  'relative flex w-full h-[22px] items-center gap-0.5 border-none pr-2 text-left font-inherit text-[13px] text-base-content cursor-pointer hover:bg-base-300'

const Chevron: Component<{ expanded: boolean }> = (props) => (
  <BsChevronRight
    class="shrink-0 text-base-content/50 transition-transform duration-100"
    classList={{ 'rotate-90': props.expanded }}
    size={TREE_ICON_SIZE}
    aria-hidden="true"
  />
)

const FileIcon: Component<{ name: string }> = (props) => (
  <Show
    when={getFileKind(props.name) === 'image'}
    fallback={
      <Show
        when={getFileKind(props.name) === 'text'}
        fallback={<BsFileEarmark size={TREE_ICON_SIZE} aria-hidden="true" />}
      >
        <BsFileEarmarkText size={TREE_ICON_SIZE} aria-hidden="true" />
      </Show>
    }
  >
    <BsFileEarmarkImage size={TREE_ICON_SIZE} aria-hidden="true" />
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
  onKeyDown: (event: KeyboardEvent) => void
}> = (props) => {
  let itemRef: HTMLButtonElement | undefined

  const isExpanded = (): boolean =>
    props.node.type === 'directory' && props.expandedPaths().has(props.node.path)

  const isSelected = (): boolean =>
    props.node.type === 'file' && props.selectedPath() === props.node.path

  const isFocused = (): boolean => props.focusedPath() === props.node.path

  const hasTextSelectionInItem = (): boolean => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString()) return false
    const item = itemRef
    if (!item) return false
    const { anchorNode, focusNode } = selection
    return (
      (anchorNode != null && item.contains(anchorNode)) ||
      (focusNode != null && item.contains(focusNode))
    )
  }

  const handleClick = (): void => {
    if (hasTextSelectionInItem()) return

    itemRef?.focus()
    props.onFocus(props.node)
    if (props.node.type === 'directory') {
      props.onToggleExpand(props.node.path)
    } else {
      props.onSelect(props.node)
    }
  }

  const handleFocus = (): void => {
    props.onFocus(props.node)
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (props.node.type === 'directory') {
        props.onToggleExpand(props.node.path)
      } else {
        props.onSelect(props.node)
      }
      return
    }

    props.onKeyDown(event)
  }

  const imageStatus = (): ImageStatus | null => {
    const root = props.projectRoot()
    if (!root || props.node.type !== 'file' || getFileKind(props.node.name) !== 'image') return null
    return props.imageStatuses()[toRelativePath(root, props.node.path)] ?? 'todo'
  }

  return (
    <>
      <button
        ref={itemRef}
        type="button"
        data-tree-item
        aria-selected={isSelected()}
        class={treeItemBaseClass}
        classList={{
          sticky: isExpanded(),
          'bg-base-200': isExpanded() && !(isFocused() && !isSelected()),
          'bg-primary/25 hover:bg-primary/25': isSelected() && isFocused(),
          'bg-primary/15 hover:bg-primary/25': isSelected() && !isFocused(),
          'bg-base-300': isFocused() && !isSelected()
        }}
        data-path={props.node.path}
        style={{
          'padding-left': `${8 + props.depth * 16}px`,
          top: isExpanded() ? `${props.depth * TREE_ROW_HEIGHT}px` : undefined,
          'z-index': isExpanded() ? props.depth + 1 : undefined
        }}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
      >
        <Show when={props.node.type === 'directory'}>
          <Chevron expanded={isExpanded()} />
        </Show>
        <Show when={props.node.type === 'file'}>
          <span class="w-4 shrink-0" />
        </Show>
        <span class="flex shrink-0 text-base-content/45">
          <Show
            when={props.node.type === 'directory'}
            fallback={<FileIcon name={props.node.name} />}
          >
            <BsFolderFill size={TREE_ICON_SIZE} aria-hidden="true" />
          </Show>
        </span>
        <span class="truncate">{props.node.name}</span>
        <Show when={imageStatus() && imageStatus() !== 'todo'}>
          <span
            class="ml-auto mr-2 h-2 w-2 shrink-0 rounded-full"
            classList={{
              'bg-primary': imageStatus() === 'in_progress',
              'bg-green-500': imageStatus() === 'done',
              'bg-neutral': imageStatus() === 'skipped'
            }}
          />
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
              onKeyDown={props.onKeyDown}
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
  embedded?: boolean
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
    const path = getActivePath() ?? getVisibleNodes()[0]?.path
    if (path) focusItemElement(path)
  }

  const focusItemElement = (path: string): void => {
    const el = treeRef?.querySelector(`[data-path="${CSS.escape(path)}"]`) as HTMLElement | null
    el?.focus({ preventScroll: true })
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
    options: { scroll?: boolean; select?: boolean; focusElement?: boolean } = {}
  ): void => {
    const previous = getActivePath()
    setFocusedPath(node.path)
    if (options.scroll) scrollToPath(node.path)
    if (options.focusElement ?? true) focusItemElement(node.path)
    if (previous !== node.path) {
      props.onFocusChange?.(node.path)
    }
    if (options.select && node.type === 'file') {
      props.onSelect(node)
    }
  }

  const focusNode = (node: FileEntry): void => {
    setNodeFocus(node, { focusElement: false })
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

  onCleanup(() => {
    treeRef = undefined
  })

  return (
    <div
      class="flex min-h-0 flex-1 flex-col"
      classList={{
        'w-[var(--sidebar-width)] min-w-[var(--sidebar-width)] border-base-300 bg-base-200 border-r':
          !props.embedded
      }}
    >
      <div class="flex items-center justify-between gap-2 px-5 pt-2.5 pb-2">
        <div class="min-w-0 truncate text-[11px] font-semibold tracking-wide text-base-content/60">
          {props.rootName().toUpperCase()}
        </div>
      </div>
      <div
        ref={treeRef}
        class="tree-scrollbar flex-1 overflow-x-hidden overflow-y-auto pb-2 outline-none focus:outline-none"
        onMouseDown={(event) => {
          if (event.target === treeRef) {
            event.preventDefault()
            focusTree()
          }
        }}
      >
        <Show
          when={props.entries().length > 0}
          fallback={<div class="px-5 py-2 text-xs text-base-content/60">No files found</div>}
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
                onKeyDown={handleKeyDown}
              />
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}

export default FileTree
