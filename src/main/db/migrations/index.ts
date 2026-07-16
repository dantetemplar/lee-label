import type Database from 'better-sqlite3'
import { MIGRATION_CURRENT } from './001-current'
import { MIGRATION_002_IMAGE_TIMINGS } from './002-image-timings'
import { DEFAULT_SEGMENTATION_MODE, SETTINGS_KEY_SEGMENTATION_MODE } from '../../../shared/segmentation'

const CURRENT_VERSION = 2

function seedSettings(db: Database.Database): void {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  )
  insert.run(SETTINGS_KEY_SEGMENTATION_MODE, DEFAULT_SEGMENTATION_MODE)
}

function hasImageTimingColumns(db: Database.Database): boolean {
  const columns = db.prepare('PRAGMA table_info(images)').all() as { name: string }[]
  return columns.some((column) => column.name === 'opened_at')
}

export function runMigrations(db: Database.Database): void {
  db.exec(MIGRATION_CURRENT)

  const row = db.prepare('SELECT MAX(version) AS version FROM schema_meta').get() as
    | { version: number | null }
    | undefined
  let currentVersion = row?.version ?? 0

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
    currentVersion = CURRENT_VERSION
  }

  if (currentVersion === 1) {
    if (!hasImageTimingColumns(db)) {
      db.exec(MIGRATION_002_IMAGE_TIMINGS)
    }
    const now = new Date().toISOString()
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(2, now)
    currentVersion = 2
  }

  if (currentVersion > CURRENT_VERSION) {
    throw new Error(`Database schema version ${currentVersion} is newer than supported ${CURRENT_VERSION}`)
  }
}
