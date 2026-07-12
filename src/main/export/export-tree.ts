import type { YoloExportTreeNode } from '../../shared/export'

const MAX_FILES_PER_DIR = 12

interface MutableNode {
  name: string
  type: 'directory' | 'file'
  children: Map<string, MutableNode>
}

function ensureChild(parent: MutableNode, name: string, type: 'directory' | 'file'): MutableNode {
  const existing = parent.children.get(name)
  if (existing) return existing
  const node: MutableNode = { name, type, children: new Map() }
  parent.children.set(name, node)
  return node
}

function toTreeNode(node: MutableNode): YoloExportTreeNode {
  if (node.type === 'file') {
    return { name: node.name, type: 'file' }
  }

  const dirs: YoloExportTreeNode[] = []
  const files: YoloExportTreeNode[] = []
  for (const child of node.children.values()) {
    const mapped = toTreeNode(child)
    if (mapped.type === 'directory') dirs.push(mapped)
    else files.push(mapped)
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  let hiddenFileCount = 0
  let visibleFiles = files
  if (files.length > MAX_FILES_PER_DIR) {
    hiddenFileCount = files.length - MAX_FILES_PER_DIR
    visibleFiles = files.slice(0, MAX_FILES_PER_DIR)
  }

  return {
    name: node.name,
    type: 'directory',
    children: [...dirs, ...visibleFiles],
    ...(hiddenFileCount > 0 ? { hiddenFileCount } : {})
  }
}

/** Build a display tree from relative output paths (`images/a.jpg`, `classes.txt`, …). */
export function buildExportFileTree(rootName: string, filePaths: string[]): YoloExportTreeNode {
  const root: MutableNode = { name: rootName, type: 'directory', children: new Map() }

  const unique = [...new Set(filePaths.map((path) => path.replace(/\\/g, '/')))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  )

  for (const filePath of unique) {
    const parts = filePath.split('/').filter(Boolean)
    if (parts.length === 0) continue
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      const isFile = i === parts.length - 1
      current = ensureChild(current, part, isFile ? 'file' : 'directory')
    }
  }

  return toTreeNode(root)
}
