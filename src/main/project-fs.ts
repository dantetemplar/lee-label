import { isAbsolute, relative, resolve } from 'path'
import { projectDatabase } from './db/project-db'

function requireProjectRoot(): string {
  const root = projectDatabase.getRootPath()
  if (!root) throw new Error('No project is open')
  return resolve(root)
}

export function resolveProjectPath(requestedPath: string): string {
  const rootResolved = requireProjectRoot()
  const resolved = isAbsolute(requestedPath)
    ? resolve(requestedPath)
    : resolve(rootResolved, requestedPath)

  const rel = relative(rootResolved, resolved)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Path escapes project root')
  }

  return resolved
}
