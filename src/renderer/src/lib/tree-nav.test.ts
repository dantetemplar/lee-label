import { describe, expect, it } from 'vitest'
import type { ImageStatus } from '../../../shared/annotations'
import type { FileEntry } from '../../../shared/types'
import {
  countImageStatuses,
  findImageByRelativePath,
  findLastImageFile,
  findNextUnfinishedImage,
  flattenImageFiles,
  getImageAtIndex,
  getImagePathByOffset,
  getImagePosition,
  isImageUnfinished,
  searchWorkspaceFiles
} from './tree-nav'

const root = '/project'

function image(name: string): FileEntry {
  return { type: 'file', name, path: `${root}/${name}`, size: 100 }
}

function folder(name: string, children: FileEntry[]): FileEntry {
  return { type: 'directory', name, path: `${root}/${name}`, children }
}

const entries: FileEntry[] = [
  folder('batch', [image('a.jpg'), image('b.jpg'), image('c.jpg')]),
  image('d.jpg')
]

describe('tree-nav dataset helpers', () => {
  it('flattens images in depth-first order', () => {
    expect(flattenImageFiles(entries).map((node) => node.name)).toEqual([
      'a.jpg',
      'b.jpg',
      'c.jpg',
      'd.jpg'
    ])
  })

  it('returns image position in flattened order', () => {
    expect(getImagePosition(entries, `${root}/b.jpg`)).toEqual({ index: 1, total: 4 })
    expect(getImagePosition(entries, `${root}/missing.jpg`)).toBeNull()
  })

  it('searches workspace files by name and relative path', () => {
    const nestedEntries: FileEntry[] = [
      folder('batch', [
        { type: 'file', name: 'a.jpg', path: `${root}/batch/a.jpg`, size: 1 },
        { type: 'file', name: 'b.jpg', path: `${root}/batch/b.jpg`, size: 1 }
      ]),
      { type: 'file', name: 'notes.txt', path: `${root}/docs/notes.txt`, size: 1 },
      { type: 'file', name: 'batch-summary.md', path: `${root}/batch-summary.md`, size: 1 }
    ]

    expect(searchWorkspaceFiles(nestedEntries, root, 'b.jpg').map((node) => node.name)).toEqual([
      'b.jpg'
    ])
    expect(searchWorkspaceFiles(nestedEntries, root, 'batch/').map((node) => node.name)).toEqual([
      'a.jpg',
      'b.jpg'
    ])
    expect(searchWorkspaceFiles(nestedEntries, root, 'notes').map((node) => node.name)).toEqual([
      'notes.txt'
    ])
  })

  it('counts statuses with missing entries treated as todo', () => {
    const statuses: Record<string, ImageStatus> = {
      'a.jpg': 'done',
      'b.jpg': 'skipped',
      'c.jpg': 'in_progress'
    }

    expect(countImageStatuses(entries, root, statuses)).toEqual({
      total: 4,
      done: 1,
      skipped: 1,
      left: 2
    })
  })

  it('treats missing status as unfinished', () => {
    expect(isImageUnfinished('a.jpg', {})).toBe(true)
    expect(isImageUnfinished('a.jpg', { 'a.jpg': 'done' })).toBe(false)
    expect(isImageUnfinished('a.jpg', { 'a.jpg': 'in_progress' })).toBe(true)
  })

  it('finds next unfinished image after current, wrapping', () => {
    const statuses: Record<string, ImageStatus> = {
      'a.jpg': 'done',
      'b.jpg': 'done',
      'c.jpg': 'todo',
      'd.jpg': 'todo'
    }

    expect(findNextUnfinishedImage(entries, root, statuses, `${root}/a.jpg`)).toBe(`${root}/c.jpg`)
    expect(findNextUnfinishedImage(entries, root, statuses, `${root}/c.jpg`)).toBe(`${root}/d.jpg`)
    expect(findNextUnfinishedImage(entries, root, statuses, `${root}/d.jpg`)).toBe(`${root}/c.jpg`)
  })

  it('returns null when every image is finished', () => {
    const statuses: Record<string, ImageStatus> = {
      'a.jpg': 'done',
      'b.jpg': 'skipped',
      'c.jpg': 'done',
      'd.jpg': 'skipped'
    }

    expect(findNextUnfinishedImage(entries, root, statuses, `${root}/a.jpg`)).toBeNull()
  })

  it('finds an image by relative path', () => {
    expect(findImageByRelativePath(entries, root, 'b.jpg')?.name).toBe('b.jpg')
    expect(findImageByRelativePath(entries, root, 'missing.jpg')).toBeNull()
  })

  it('seeks by index and offset', () => {
    expect(getImageAtIndex(entries, 2)?.name).toBe('c.jpg')
    expect(getImageAtIndex(entries, 99)).toBeNull()
    expect(getImagePathByOffset(entries, `${root}/a.jpg`, 10)).toBe(`${root}/d.jpg`)
    expect(getImagePathByOffset(entries, `${root}/d.jpg`, -2)).toBe(`${root}/b.jpg`)
    expect(getImagePathByOffset(entries, `${root}/a.jpg`, 0)).toBeNull()
    expect(findLastImageFile(entries)?.name).toBe('d.jpg')
  })
})
