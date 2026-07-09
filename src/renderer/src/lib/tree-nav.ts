import type { FileEntry } from '../../../shared/types'
import { getFileKind } from '../../../shared/file-types'

const DEFAULT_EXPAND_DEPTH = 2
const DEFAULT_EXPAND_MAX_FILES = 20

function countFilesInDirectory(node: FileEntry): number {
  if (node.type !== 'directory' || !node.children) return 0

  let count = 0
  for (const child of node.children) {
    if (child.type === 'file') count++
    else count += countFilesInDirectory(child)
  }
  return count
}

export function getDefaultExpandedPaths(
  entries: FileEntry[],
  depth = 0,
  expanded = new Set<string>()
): Set<string> {
  for (const node of entries) {
    if (node.type === 'directory') {
      const fileCount = countFilesInDirectory(node)
      if (depth < DEFAULT_EXPAND_DEPTH && fileCount <= DEFAULT_EXPAND_MAX_FILES) {
        expanded.add(node.path)
      }
      if (node.children) getDefaultExpandedPaths(node.children, depth + 1, expanded)
    }
  }
  return expanded
}

export function flattenVisibleTree(entries: FileEntry[], expandedPaths: Set<string>): FileEntry[] {
  const visible: FileEntry[] = []

  for (const node of entries) {
    visible.push(node)
    if (node.type === 'directory' && expandedPaths.has(node.path) && node.children) {
      visible.push(...flattenVisibleTree(node.children, expandedPaths))
    }
  }

  return visible
}

export function findNodeByPath(entries: FileEntry[], path: string): FileEntry | null {
  for (const node of entries) {
    if (node.path === path) return node
    if (node.children) {
      const found = findNodeByPath(node.children, path)
      if (found) return found
    }
  }
  return null
}

export function findParentPath(
  entries: FileEntry[],
  path: string,
  parentPath: string | null = null
): string | null {
  for (const node of entries) {
    if (node.path === path) return parentPath
    if (node.children) {
      const found = findParentPath(node.children, path, node.path)
      if (found !== null) return found
    }
  }
  return null
}

function flattenImageFiles(entries: FileEntry[]): FileEntry[] {
  const images: FileEntry[] = []

  for (const node of entries) {
    if (node.type === 'file' && getFileKind(node.name) === 'image') {
      images.push(node)
    } else if (node.type === 'directory' && node.children) {
      images.push(...flattenImageFiles(node.children))
    }
  }

  return images
}

export function getAdjacentImagePaths(
  entries: FileEntry[],
  currentPath: string
): { prev: string | null; next: string | null } {
  const images = flattenImageFiles(entries)
  const index = images.findIndex((node) => node.path === currentPath)
  if (index < 0) return { prev: null, next: null }

  return {
    prev: index > 0 ? images[index - 1].path : null,
    next: index + 1 < images.length ? images[index + 1].path : null
  }
}
