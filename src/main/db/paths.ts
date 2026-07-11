import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { join } from 'path'

const DB_FILENAME = 'lee-label.sqlite'

export function getDbPath(projectRoot: string): string {
  return join(projectRoot, DB_FILENAME)
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
