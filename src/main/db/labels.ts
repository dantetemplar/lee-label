import { randomUUID } from 'crypto'
import type {
  CreateLabelInput,
  Label,
  LabelDeleteStats,
  UpdateLabelInput
} from '../../shared/annotations'
import { getLabelColor } from '../../shared/label-color'
import type { DbContext, LabelRow } from './types'
import { mapLabel } from './types'

export class LabelsRepository {
  constructor(private readonly ctx: DbContext) {}

  listLabels(): Label[] {
    const rows = this.ctx
      .requireDb()
      .prepare('SELECT * FROM labels ORDER BY sort_order ASC, name ASC')
      .all() as LabelRow[]
    return rows.map(mapLabel)
  }

  createLabel(input: CreateLabelInput): Label {
    const db = this.ctx.requireDb()
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM labels')
      .get() as {
      max_order: number
    }
    const maxClassId = db
      .prepare('SELECT COALESCE(MAX(class_id), 0) AS max_class_id FROM labels')
      .get() as {
      max_class_id: number
    }
    if (maxClassId.max_class_id >= 65535) {
      throw new Error('Maximum number of labels (65535) reached')
    }
    const existingColors = (
      db.prepare('SELECT color FROM labels').all() as { color: string }[]
    ).map((row) => row.color)
    const id = randomUUID()
    const label: Label = {
      id,
      name: input.name,
      color: input.color?.trim() || getLabelColor(input.name, existingColors),
      classId: maxClassId.max_class_id + 1,
      sortOrder: maxOrder.max_order + 1,
      shortcut: input.shortcut
    }
    db.prepare(
      'INSERT INTO labels (id, name, color, class_id, sort_order, shortcut) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(label.id, label.name, label.color, label.classId, label.sortOrder, label.shortcut ?? null)
    this.ctx.touchProject()
    return label
  }

  updateLabel(input: UpdateLabelInput): Label {
    const db = this.ctx.requireDb()
    const existing = db.prepare('SELECT * FROM labels WHERE id = ?').get(input.id) as
      LabelRow | undefined
    if (!existing) throw new Error('Label not found')

    db.prepare('UPDATE labels SET name = ?, color = ?, shortcut = ? WHERE id = ?').run(
      input.name,
      input.color,
      input.shortcut ?? null,
      input.id
    )
    this.ctx.touchProject()
    return mapLabel({
      ...existing,
      name: input.name,
      color: input.color,
      shortcut: input.shortcut ?? null
    })
  }

  deleteLabel(id: string): void {
    const db = this.ctx.requireDb()
    const existing = db.prepare('SELECT id FROM labels WHERE id = ?').get(id) as
      { id: string } | undefined
    if (!existing) throw new Error('Label not found')

    const deleteShapes = db.prepare('DELETE FROM shapes WHERE label_id = ?')
    const deleteLabelRow = db.prepare('DELETE FROM labels WHERE id = ?')

    const tx = db.transaction(() => {
      deleteShapes.run(id)
      deleteLabelRow.run(id)
    })
    tx()
    this.ctx.touchProject()
  }

  getLabelDeleteStats(id: string): LabelDeleteStats {
    const db = this.ctx.requireDb()
    const existing = db.prepare('SELECT id FROM labels WHERE id = ?').get(id) as
      { id: string } | undefined
    if (!existing) throw new Error('Label not found')

    const row = db
      .prepare(
        `SELECT
          COUNT(*) AS instanceCount,
          COUNT(DISTINCT image_id) AS fileCount
        FROM shapes
        WHERE label_id = ?`
      )
      .get(id) as { instanceCount: number; fileCount: number }

    return {
      fileCount: row.fileCount,
      instanceCount: row.instanceCount
    }
  }
}
