export const MIGRATION_002_IMAGE_TIMINGS = `
ALTER TABLE images ADD COLUMN first_labeled_at TEXT;
ALTER TABLE images ADD COLUMN done_at TEXT;
ALTER TABLE images ADD COLUMN opened_at TEXT;
`
