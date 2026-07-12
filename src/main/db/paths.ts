import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'

const DB_DIR = '.lee-label'
const DB_FILENAME = 'lee-label.sqlite'

export function getDbPath(projectRoot: string): string {
  return join(projectRoot, DB_DIR, DB_FILENAME)
}

export function ensureDbDir(projectRoot: string): string {
  const dbPath = getDbPath(projectRoot)
  mkdirSync(dirname(dbPath), { recursive: true })
  return dbPath
}

export function readStoredProjectName(rootPath: string): string | null {
  const dbPath = getDbPath(rootPath)
  if (!existsSync(dbPath)) return null

  const db = new Database(dbPath, { readonly: true })
  try {
    const row = db.prepare('SELECT name FROM project WHERE id = 1').get() as { name: string | null } | undefined
    const name = row?.name?.trim()
    return name || null
  } finally {
    db.close()
  }
}
