import type { RecentProject } from '../../../shared/types'

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function getRecentProjectParentLabel(project: RecentProject): string {
  const name = project.name
  let label = normalizePath(project.displayPath)

  if (label.endsWith(`/${name}`)) {
    label = label.slice(0, -(name.length + 1))
  }

  return label || '~'
}

export function getRecentProjectFullLabel(project: RecentProject): string {
  const parent = getRecentProjectParentLabel(project)
  if (parent === '~') return `~/${project.name}`
  return `${parent}/${project.name}`
}

export function truncatePathStart(path: string, maxLength = 34): string {
  if (path.length <= maxLength) return path
  return `\u2026${path.slice(-(maxLength - 1))}`
}
