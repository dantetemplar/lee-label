import type Database from 'better-sqlite3'
import { MIGRATION_001 } from './001-initial'
import { MIGRATION_002 } from './002-segmentation'
import { DEFAULT_SEGMENTATION_MODE, SETTINGS_KEY_SEGMENTATION_MODE } from '../../../shared/segmentation'

const CURRENT_VERSION = 2

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { name: string } | undefined
  return Boolean(row)
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.some((row) => row.name === column)
}

function migrateShapesTable(db: Database.Database): void {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'shapes'").get() as
    | { sql: string }
    | undefined
  if (row?.sql?.includes("'polygon'")) return

  db.exec(`
    CREATE TABLE shapes_new (
      id TEXT PRIMARY KEY,
      image_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('rectangle', 'mask', 'polygon')),
      label_id TEXT NOT NULL REFERENCES labels(id),
      z_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      x REAL,
      y REAL,
      width REAL,
      height REAL,
      bounds_x REAL,
      bounds_y REAL,
      bounds_width REAL,
      bounds_height REAL
    );

    INSERT INTO shapes_new
      SELECT id, image_id, type, label_id, z_order, created_at, updated_at,
             x, y, width, height, bounds_x, bounds_y, bounds_width, bounds_height
      FROM shapes;

    DROP TABLE shapes;
    ALTER TABLE shapes_new RENAME TO shapes;
    CREATE INDEX IF NOT EXISTS idx_shapes_image ON shapes(image_id);
  `)
}

function migrateLabelsClassId(db: Database.Database): void {
  if (columnExists(db, 'labels', 'class_id')) return

  db.exec('ALTER TABLE labels ADD COLUMN class_id INTEGER')
  const labels = db
    .prepare('SELECT id FROM labels ORDER BY sort_order ASC, name ASC')
    .all() as { id: string }[]
  const update = db.prepare('UPDATE labels SET class_id = ? WHERE id = ?')
  labels.forEach((label, index) => {
    update.run(index + 1, label.id)
  })
}

function seedSettings(db: Database.Database): void {
  const now = new Date().toISOString()
  const insert = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  )
  insert.run(SETTINGS_KEY_SEGMENTATION_MODE, DEFAULT_SEGMENTATION_MODE)
  void now
}

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

  if (currentVersion < 2) {
    const now = new Date().toISOString()
    migrateLabelsClassId(db)
    migrateShapesTable(db)
    db.exec(MIGRATION_002)
    seedSettings(db)
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(2, now)
  }

  if (!tableExists(db, 'settings')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
    seedSettings(db)
  }

  if (currentVersion > CURRENT_VERSION) {
    throw new Error(`Database schema version ${currentVersion} is newer than supported ${CURRENT_VERSION}`)
  }
}
