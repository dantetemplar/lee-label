import { describe, expect, it } from 'vitest'
import { buildExportFileTree } from './export-tree'

describe('buildExportFileTree', () => {
  it('nests images and labels under the output root', () => {
    const tree = buildExportFileTree('dataset', [
      'classes.txt',
      'images/train/a.jpg',
      'images/train/b.jpg',
      'labels/train/a.txt',
      'labels/train/b.txt'
    ])

    expect(tree.name).toBe('dataset')
    expect(tree.type).toBe('directory')
    expect(tree.children?.map((child) => child.name)).toEqual(['images', 'labels', 'classes.txt'])
    const images = tree.children?.find((child) => child.name === 'images')
    expect(images?.children?.[0]?.name).toBe('train')
    expect(images?.children?.[0]?.children?.map((child) => child.name)).toEqual(['a.jpg', 'b.jpg'])
  })

  it('truncates long file lists per directory', () => {
    const files = Array.from({ length: 20 }, (_, index) => `labels/${index}.txt`)
    const tree = buildExportFileTree('out', files)
    const labels = tree.children?.find((child) => child.name === 'labels')
    expect(labels?.hiddenFileCount).toBe(8)
    expect(labels?.children?.filter((child) => child.type === 'file')).toHaveLength(12)
  })
})
