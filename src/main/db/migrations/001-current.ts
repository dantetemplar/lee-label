export const MIGRATION_CURRENT = `
CREATE TABLE IF NOT EXISTS schema_meta (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS labels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  shortcut TEXT,
  class_id INTEGER
);

CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relative_path TEXT NOT NULL UNIQUE,
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'done', 'skipped')),
  updated_at TEXT,
  first_labeled_at TEXT,
  done_at TEXT,
  opened_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_images_status ON images(status);
CREATE INDEX IF NOT EXISTS idx_images_path ON images(relative_path);

CREATE TABLE IF NOT EXISTS shapes (
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

CREATE INDEX IF NOT EXISTS idx_shapes_image ON shapes(image_id);

CREATE TABLE IF NOT EXISTS mask_data (
  shape_id TEXT PRIMARY KEY REFERENCES shapes(id) ON DELETE CASCADE,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  format TEXT NOT NULL DEFAULT 'bitmap' CHECK (format = 'bitmap'),
  data BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS polygon_data (
  shape_id TEXT PRIMARY KEY REFERENCES shapes(id) ON DELETE CASCADE,
  rings_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS semantic_masks (
  image_id INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  format TEXT NOT NULL DEFAULT 'png16' CHECK (format = 'png16'),
  data BLOB NOT NULL
);
`
