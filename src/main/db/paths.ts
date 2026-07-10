import { join } from 'path'

export const DB_FILENAME = 'lee-label.sqlite'

export function getDbPath(projectRoot: string): string {
  return join(projectRoot, DB_FILENAME)
}

export function toRelativePath(projectRoot: string, absolutePath: string): string {
  const normalizedRoot = projectRoot.replace(/\\/g, '/').replace(/\/$/, '')
  const normalizedPath = absolutePath.replace(/\\/g, '/')
  if (normalizedPath === normalizedRoot) return ''
  if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1)
  }
  return normalizedPath
}

export function toAbsolutePath(projectRoot: string, relativePath: string): string {
  return join(projectRoot, relativePath)
}
