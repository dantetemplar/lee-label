import type { ImageStatus } from '../../../shared/annotations'
import { getFileKind } from '../../../shared/file-types'
import { toRelativePath } from '../../../shared/paths'
import type { FileEntry } from '../../../shared/types'

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

export function flattenImageFiles(entries: FileEntry[]): FileEntry[] {
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

export function findFirstImageFile(entries: FileEntry[]): FileEntry | null {
  return flattenImageFiles(entries)[0] ?? null
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

export function getImagePosition(
  entries: FileEntry[],
  currentPath: string
): { index: number; total: number } | null {
  const images = flattenImageFiles(entries)
  const index = images.findIndex((node) => node.path === currentPath)
  if (index < 0) return null
  return { index, total: images.length }
}

export function isImageUnfinished(
  relativePath: string,
  imageStatuses: Record<string, ImageStatus>
): boolean {
  const status = imageStatuses[relativePath] ?? 'todo'
  return status === 'todo' || status === 'in_progress'
}

export function countImageStatuses(
  entries: FileEntry[],
  folderRoot: string,
  imageStatuses: Record<string, ImageStatus>
): { total: number; done: number; skipped: number; left: number } {
  const images = flattenImageFiles(entries)
  let done = 0
  let skipped = 0
  let left = 0

  for (const image of images) {
    const relativePath = toRelativePath(folderRoot, image.path)
    const status = imageStatuses[relativePath] ?? 'todo'
    if (status === 'done') done++
    else if (status === 'skipped') skipped++
    else left++
  }

  return { total: images.length, done, skipped, left }
}

export function listImageStatusesInOrder(
  entries: FileEntry[],
  folderRoot: string,
  imageStatuses: Record<string, ImageStatus>
): ImageStatus[] {
  return flattenImageFiles(entries).map(
    (image) => imageStatuses[toRelativePath(folderRoot, image.path)] ?? 'todo'
  )
}

export function findNextUnfinishedImage(
  entries: FileEntry[],
  folderRoot: string,
  imageStatuses: Record<string, ImageStatus>,
  fromPath: string
): string | null {
  const images = flattenImageFiles(entries)
  const fromIndex = images.findIndex((node) => node.path === fromPath)
  if (fromIndex < 0 || images.length === 0) return null

  for (let offset = 1; offset < images.length; offset++) {
    const index = (fromIndex + offset) % images.length
    const image = images[index]
    const relativePath = toRelativePath(folderRoot, image.path)
    if (isImageUnfinished(relativePath, imageStatuses)) {
      return image.path
    }
  }

  return null
}

export function getImageAtIndex(entries: FileEntry[], index: number): FileEntry | null {
  const images = flattenImageFiles(entries)
  if (index < 0 || index >= images.length) return null
  return images[index] ?? null
}

export function getImagePathByOffset(
  entries: FileEntry[],
  currentPath: string,
  offset: number
): string | null {
  const images = flattenImageFiles(entries)
  const index = images.findIndex((node) => node.path === currentPath)
  if (index < 0) return null

  const nextIndex = Math.min(Math.max(index + offset, 0), images.length - 1)
  if (nextIndex === index) return null
  return images[nextIndex]?.path ?? null
}

export function findLastImageFile(entries: FileEntry[]): FileEntry | null {
  const images = flattenImageFiles(entries)
  return images[images.length - 1] ?? null
}

export function flattenWorkspaceFiles(entries: FileEntry[]): FileEntry[] {
  const files: FileEntry[] = []

  for (const node of entries) {
    if (node.type === 'file') {
      if (getFileKind(node.name) !== 'unsupported') files.push(node)
    } else if (node.children) {
      files.push(...flattenWorkspaceFiles(node.children))
    }
  }

  return files
}

export function searchWorkspaceFiles(
  entries: FileEntry[],
  projectRoot: string,
  query: string,
  limit = 50
): FileEntry[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return []

  const results: FileEntry[] = []
  for (const file of flattenWorkspaceFiles(entries)) {
    const relative = toRelativePath(projectRoot, file.path).toLowerCase()
    if (file.name.toLowerCase().includes(trimmed) || relative.includes(trimmed)) {
      results.push(file)
      if (results.length >= limit) break
    }
  }

  return results
}
