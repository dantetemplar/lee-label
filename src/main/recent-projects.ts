import { app } from 'electron'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import type { RecentProject } from '../shared/types'
import { formatDisplayPath } from '../shared/paths'
import { readStoredProjectName } from './db/paths'

const MAX_RECENT = 10

interface RecentStore {
  projects: RecentProject[]
}

function getStorePath(): string {
  return join(app.getPath('userData'), 'recent-projects.json')
}

function getParentDisplayPath(path: string): string {
  return formatDisplayPath(dirname(path), app.getPath('home'))
}

function getFolderName(path: string): string {
  return basename(path)
}

function normalizeProjectPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '') || path
}

function getRecentProjectDisplayName(path: string, folderName: string): string {
  const storedName = readStoredProjectName(path)
  if (storedName && storedName !== folderName) {
    return `${storedName} (${folderName}/)`
  }
  return folderName
}

function toRecentProject(path: string, openedAt: number): RecentProject {
  const folderName = getFolderName(path)
  return {
    path,
    folderName,
    name: getRecentProjectDisplayName(path, folderName),
    displayPath: getParentDisplayPath(path),
    openedAt
  }
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
    const staleEntry = store.projects.some((project, index) => {
      const refreshed = projects[index]
      if (!refreshed) return true
      return (
        project.displayPath !== refreshed.displayPath ||
        project.name !== refreshed.name ||
        project.folderName !== refreshed.folderName
      )
    })
    if (staleEntry) {
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

export async function removeRecentProject(path: string): Promise<RecentProject[]> {
  const targetPath = normalizeProjectPath(path)
  const store = await readStore()
  const remaining = store.projects.filter(
    (project) => normalizeProjectPath(project.path) !== targetPath
  )

  await writeStore({ projects: remaining })

  const projects: RecentProject[] = []
  for (const project of remaining) {
    if (await isExistingDirectory(project.path)) {
      projects.push(toRecentProject(project.path, project.openedAt))
    }
  }

  if (projects.length !== remaining.length) {
    await writeStore({ projects })
  }

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
