import type Database from 'better-sqlite3'
import { MIGRATION_001 } from './001-initial'

const CURRENT_VERSION = 1

export function runMigrations(db: Database.Database): void {
  db.exec(MIGRATION_001)

  const row = db.prepare('SELECT MAX(version) AS version FROM schema_meta').get() as
    | { version: number | null }
    | undefined
  const currentVersion = row?.version ?? 0

  if (currentVersion < 1) {
    const now = new Date().toISOString()
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(1, now)

    const project = db.prepare('SELECT id FROM project WHERE id = 1').get()
    if (!project) {
      db.prepare('INSERT INTO project (id, name, created_at, updated_at) VALUES (1, NULL, ?, ?)').run(
        now,
        now
      )
    }
  }

  if (currentVersion > CURRENT_VERSION) {
    throw new Error(`Database schema version ${currentVersion} is newer than supported ${CURRENT_VERSION}`)
  }
}
