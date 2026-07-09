import { app } from 'electron'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { RecentProject } from '../shared/types'

const MAX_RECENT = 10

interface RecentStore {
  projects: RecentProject[]
}

function getStorePath(): string {
  return join(app.getPath('userData'), 'recent-projects.json')
}

function formatDisplayPath(path: string): string {
  const home = app.getPath('home')
  if (path === home) return '~'
  if (path.startsWith(home + '/')) return `~${path.slice(home.length)}`
  if (path.startsWith(home + '\\')) return `~${path.slice(home.length).replace(/\\/g, '/')}`
  return path
}

function getParentDisplayPath(path: string): string {
  return formatDisplayPath(dirname(path))
}

function toRecentProject(path: string, openedAt: number): RecentProject {
  return {
    path,
    name: getProjectName(path),
    displayPath: getParentDisplayPath(path),
    openedAt
  }
}

function getProjectName(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

async function readStore(): Promise<RecentStore> {
  try {
    const raw = await readFile(getStorePath(), 'utf8')
    const parsed = JSON.parse(raw) as RecentStore
    if (!Array.isArray(parsed.projects)) return { projects: [] }
    return parsed
  } catch {
    return { projects: [] }
  }
}

async function writeStore(store: RecentStore): Promise<void> {
  const filePath = getStorePath()
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(store, null, 2), 'utf8')
}

export async function getRecentProjects(): Promise<RecentProject[]> {
  const store = await readStore()
  const projects: RecentProject[] = []

  for (const project of store.projects) {
    if (await isExistingDirectory(project.path)) {
      projects.push(toRecentProject(project.path, project.openedAt))
    }
  }

  if (projects.length !== store.projects.length) {
    await writeStore({ projects })
  } else {
    const staleDisplayPath = store.projects.some(
      (project, index) => project.displayPath !== projects[index]?.displayPath
    )
    if (staleDisplayPath) {
      await writeStore({ projects })
    }
  }

  return projects
}

export async function addRecentProject(path: string): Promise<RecentProject[]> {
  const store = await readStore()
  const entry = toRecentProject(path, Date.now())

  const projects = [entry, ...store.projects.filter((project) => project.path !== path)].slice(
    0,
    MAX_RECENT
  )

  await writeStore({ projects })
  return projects
}

export async function isExistingDirectory(path: string): Promise<boolean> {
  try {
    const fileStat = await stat(path)
    return fileStat.isDirectory()
  } catch {
    return false
  }
}
