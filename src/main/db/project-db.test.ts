import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { ProjectDatabase } from './project-db'

let sqliteAvailable = true
try {
  const probe = new Database(':memory:')
  probe.close()
} catch {
  sqliteAvailable = false
}

describe.skipIf(!sqliteAvailable)('ProjectDatabase', () => {
  it('replaces image shapes for a fresh project', () => {
    const root = mkdtempSync(join(tmpdir(), 'lee-label-test-'))
    const db = new ProjectDatabase()

    try {
      const first = db.open(root)
      expect(first.isNew).toBe(true)
      db.close()

      const second = db.open(root)
      expect(second.isNew).toBe(false)

      const label = db.createLabel({ name: 'object' })
      const shapes = db.replaceImageShapes(
        'images/sample.png',
        [
          {
            id: 'rect-1',
            relativePath: 'images/sample.png',
            labelId: label.id,
            zOrder: 0,
            x: 1,
            y: 2,
            width: 10,
            height: 8,
            imageWidth: 100,
            imageHeight: 80
          }
        ],
        [],
        [],
        100,
        80
      )

      expect(shapes).toHaveLength(1)
      expect(shapes[0]?.type).toBe('rectangle')
      expect(db.listShapes('images/sample.png')).toHaveLength(1)
    } finally {
      db.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
