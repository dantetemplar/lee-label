export const MIGRATION_002 = `
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
