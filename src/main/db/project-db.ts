import Database from 'better-sqlite3'
import { basename } from 'path'
import type {
  AnnotationStats,
  CreateLabelInput,
  ImageRecord,
  ImageStatus,
  Label,
  LabelDeleteStats,
  MaskBlob,
  SaveMaskInput,
  SavePolygonInput,
  SaveRectangleInput,
  SemanticMaskBlob,
  Shape,
  UpdateLabelInput
} from '../../shared/annotations'
import {
  DEFAULT_SEGMENTATION_MODE,
  type ProjectSettings,
  type SegmentationMode,
  SETTINGS_KEY_SEGMENTATION_MODE
} from '../../shared/segmentation'
import {
  EMPTY_WORKSPACE_SESSION,
  SETTINGS_KEY_WORKSPACE_SESSION,
  type WorkspaceSession
} from '../../shared/workspace-session'
import { ImagesRepository } from './images'
import { LabelsRepository } from './labels'
import { runMigrations } from './migrations'
import { ensureDbDir, projectDbExists } from './paths'
import { SemanticMasksRepository } from './semantic-masks'
import { ShapesRepository } from './shapes'
import type { DbContext } from './types'

export class ProjectDatabase implements DbContext {
  private db: Database.Database | null = null
  private rootPath: string | null = null
  private labelsRepo: LabelsRepository
  private imagesRepo: ImagesRepository
  private shapesRepo: ShapesRepository
  private semanticMasksRepo: SemanticMasksRepository

  constructor() {
    this.labelsRepo = new LabelsRepository(this)
    this.imagesRepo = new ImagesRepository(this)
    this.shapesRepo = new ShapesRepository(this, this.imagesRepo)
    this.semanticMasksRepo = new SemanticMasksRepository(this, this.imagesRepo)
  }

  open(rootPath: string): { isNew: boolean } {
    const isNew = !projectDbExists(rootPath)
    this.close()
    const dbPath = ensureDbDir(rootPath)
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('synchronous = NORMAL')
    runMigrations(this.db)
    this.rootPath = rootPath

    const name = basename(rootPath)
    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE project SET name = COALESCE(name, ?), updated_at = ? WHERE id = 1')
      .run(name, now)

    return { isNew }
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.rootPath = null
    }
  }

  getRootPath(): string | null {
    return this.rootPath
  }

  getProject(): ProjectSettings {
    const db = this.requireDb()
    const row = db.prepare('SELECT name FROM project WHERE id = 1').get() as { name: string | null }
    const defaultName = basename(this.rootPath ?? '')
    return {
      name: row.name?.trim() || defaultName,
      segmentationMode: this.getSetting<SegmentationMode>(
        SETTINGS_KEY_SEGMENTATION_MODE,
        DEFAULT_SEGMENTATION_MODE
      )
    }
  }

  updateProject(input: { name?: string; segmentationMode?: SegmentationMode }): ProjectSettings {
    const db = this.requireDb()
    const now = new Date().toISOString()

    if (input.name !== undefined) {
      const trimmed = input.name.trim()
      if (!trimmed) throw new Error('Project name cannot be empty')
      db.prepare('UPDATE project SET name = ?, updated_at = ? WHERE id = 1').run(trimmed, now)
    }

    if (input.segmentationMode !== undefined) {
      this.setSetting(SETTINGS_KEY_SEGMENTATION_MODE, input.segmentationMode)
    }

    this.touchProject()
    return this.getProject()
  }

  getWorkspaceSession(): WorkspaceSession {
    const stored = this.getSetting<{ lastImageRelativePath?: string | null }>(
      SETTINGS_KEY_WORKSPACE_SESSION,
      EMPTY_WORKSPACE_SESSION
    )
    return { lastImageRelativePath: stored.lastImageRelativePath ?? null }
  }

  setWorkspaceSession(session: WorkspaceSession): void {
    this.setSetting(SETTINGS_KEY_WORKSPACE_SESSION, session)
    this.touchProject()
  }

  getAnnotationStats(): AnnotationStats {
    const db = this.requireDb()
    const shapeCount = (
      db.prepare('SELECT COUNT(*) AS count FROM shapes').get() as { count: number }
    ).count
    const semanticMaskCount = (
      db.prepare('SELECT COUNT(*) AS count FROM semantic_masks').get() as { count: number }
    ).count
    return { shapeCount, semanticMaskCount }
  }

  listLabels(): Label[] {
    return this.labelsRepo.listLabels()
  }

  createLabel(input: CreateLabelInput): Label {
    return this.labelsRepo.createLabel(input)
  }

  updateLabel(input: UpdateLabelInput): Label {
    return this.labelsRepo.updateLabel(input)
  }

  deleteLabel(id: string): void {
    this.labelsRepo.deleteLabel(id)
  }

  getLabelDeleteStats(id: string): LabelDeleteStats {
    return this.labelsRepo.getLabelDeleteStats(id)
  }

  getOrCreateImage(relativePath: string, width?: number, height?: number): ImageRecord {
    return this.imagesRepo.getOrCreateImage(relativePath, width, height)
  }

  setImageStatus(relativePath: string, status: ImageStatus): ImageRecord {
    return this.imagesRepo.setImageStatus(relativePath, status)
  }

  listImageStatuses(): Record<string, ImageStatus> {
    return this.imagesRepo.listImageStatuses()
  }

  markImageOpened(relativePath: string): ImageRecord {
    return this.imagesRepo.markImageOpened(relativePath)
  }

  getImageMeta(relativePath: string): ImageRecord | null {
    return this.imagesRepo.getImageMeta(relativePath)
  }

  listShapes(relativePath: string): Shape[] {
    return this.shapesRepo.listShapes(relativePath)
  }

  getMaskBlob(shapeId: string): MaskBlob | null {
    return this.shapesRepo.getMaskBlob(shapeId)
  }

  replaceImageShapes(
    relativePath: string,
    rectangles: SaveRectangleInput[],
    masks: { input: SaveMaskInput; data: Buffer }[],
    polygons: SavePolygonInput[],
    imageWidth?: number,
    imageHeight?: number
  ): Shape[] {
    return this.shapesRepo.replaceImageShapes(
      relativePath,
      rectangles,
      masks,
      polygons,
      imageWidth,
      imageHeight
    )
  }

  getSemanticMask(relativePath: string): SemanticMaskBlob | null {
    return this.semanticMasksRepo.getSemanticMask(relativePath)
  }

  saveSemanticMask(
    relativePath: string,
    width: number,
    height: number,
    classMap: Uint16Array
  ): SemanticMaskBlob {
    return this.semanticMasksRepo.saveSemanticMask(relativePath, width, height, classMap)
  }

  decodeSemanticMask(blob: SemanticMaskBlob): Uint16Array {
    return this.semanticMasksRepo.decodeSemanticMask(blob)
  }

  requireDb(): Database.Database {
    if (!this.db) throw new Error('No project database is open')
    return this.db
  }

  touchProject(): void {
    const now = new Date().toISOString()
    this.requireDb().prepare('UPDATE project SET updated_at = ? WHERE id = 1').run(now)
  }

  private getSetting<T>(key: string, fallback: T): T {
    const row = this.requireDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined
    if (!row) return fallback
    try {
      return JSON.parse(row.value) as T
    } catch {
      return row.value as T
    }
  }

  private setSetting(key: string, value: unknown): void {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    this.requireDb()
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, serialized)
  }
}

export const projectDatabase = new ProjectDatabase()
