import type { RecentProject } from '../../../shared/types'

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function getRecentProjectParentLabel(project: RecentProject): string {
  const folderName = project.folderName
  let label = normalizePath(project.displayPath)

  if (label.endsWith(`/${folderName}`)) {
    label = label.slice(0, -(folderName.length + 1))
  }

  return label || '~'
}

export function getRecentProjectFullLabel(project: RecentProject): string {
  const parent = getRecentProjectParentLabel(project)
  if (parent === '~') return `~/${project.folderName}`
  return `${parent}/${project.folderName}`
}

export function getRecentProjectTitleParts(project: RecentProject): {
  title: string
  folderSuffix: string | null
} {
  if (project.name === project.folderName) {
    return { title: project.name, folderSuffix: null }
  }

  const folderSuffix = ` (${project.folderName}/)`
  if (project.name.endsWith(folderSuffix)) {
    return {
      title: project.name.slice(0, -folderSuffix.length),
      folderSuffix
    }
  }

  return { title: project.name, folderSuffix: null }
}

export function truncatePathStart(path: string, maxLength = 34): string {
  if (path.length <= maxLength) return path
  return `\u2026${path.slice(-(maxLength - 1))}`
}
