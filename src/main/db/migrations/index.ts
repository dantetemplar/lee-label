import type Database from 'better-sqlite3'
import { MIGRATION_CURRENT } from './001-current'
import { DEFAULT_SEGMENTATION_MODE, SETTINGS_KEY_SEGMENTATION_MODE } from '../../../shared/segmentation'

const CURRENT_VERSION = 1

function seedSettings(db: Database.Database): void {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  )
  insert.run(SETTINGS_KEY_SEGMENTATION_MODE, DEFAULT_SEGMENTATION_MODE)
}

export function runMigrations(db: Database.Database): void {
  db.exec(MIGRATION_CURRENT)

  const row = db.prepare('SELECT MAX(version) AS version FROM schema_meta').get() as
    | { version: number | null }
    | undefined
  const currentVersion = row?.version ?? 0

  if (currentVersion === 0) {
    const now = new Date().toISOString()
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(
      CURRENT_VERSION,
      now
    )
    db.prepare('INSERT INTO project (id, name, created_at, updated_at) VALUES (1, NULL, ?, ?)').run(
      now,
      now
    )
    seedSettings(db)
  }

  if (currentVersion > CURRENT_VERSION) {
    throw new Error(`Database schema version ${currentVersion} is newer than supported ${CURRENT_VERSION}`)
  }
}
