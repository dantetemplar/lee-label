import { ipcMain } from 'electron'
import type {
  CreateLabelInput,
  ImageStatus,
  SaveMaskInput,
  SavePolygonInput,
  SaveRectangleInput,
  UpdateLabelInput
} from '../shared/annotations'
import type { SegmentationMode } from '../shared/segmentation'
import type { WorkspaceSession } from '../shared/workspace-session'
import { projectDatabase } from './db/project-db'

function requireOpenProject(): void {
  if (!projectDatabase.getRootPath()) {
    throw new Error('No project is open')
  }
}

export function registerAnnotationsIpc(): void {
  ipcMain.handle('project:open', (_, rootPath: string) => {
    projectDatabase.open(rootPath)
    const settings = projectDatabase.getProject()
    return { rootPath, ...settings }
  })

  ipcMain.handle('project:close', () => {
    projectDatabase.close()
  })

  ipcMain.handle(
    'project:update',
    (
      _,
      input: {
        name?: string
        segmentationMode?: SegmentationMode
      }
    ) => {
      requireOpenProject()
      return projectDatabase.updateProject(input)
    }
  )

  ipcMain.handle('project:get-annotation-stats', () => {
    requireOpenProject()
    return projectDatabase.getAnnotationStats()
  })

  ipcMain.handle('project:get-workspace-session', () => {
    requireOpenProject()
    return projectDatabase.getWorkspaceSession()
  })

  ipcMain.handle('project:set-workspace-session', (_, session: WorkspaceSession) => {
    requireOpenProject()
    projectDatabase.setWorkspaceSession(session)
  })

  ipcMain.handle('labels:list', () => {
    requireOpenProject()
    return projectDatabase.listLabels()
  })

  ipcMain.handle('labels:create', (_, input: CreateLabelInput) => {
    requireOpenProject()
    return projectDatabase.createLabel(input)
  })

  ipcMain.handle('labels:update', (_, input: UpdateLabelInput) => {
    requireOpenProject()
    return projectDatabase.updateLabel(input)
  })

  ipcMain.handle('labels:delete', (_, id: string) => {
    requireOpenProject()
    projectDatabase.deleteLabel(id)
  })

  ipcMain.handle('labels:get-delete-stats', (_, id: string) => {
    requireOpenProject()
    return projectDatabase.getLabelDeleteStats(id)
  })

  ipcMain.handle(
    'images:get-or-create',
    (_, relativePath: string, width?: number, height?: number) => {
      requireOpenProject()
      return projectDatabase.getOrCreateImage(relativePath, width, height)
    }
  )

  ipcMain.handle('images:set-status', (_, relativePath: string, status: ImageStatus) => {
    requireOpenProject()
    return projectDatabase.setImageStatus(relativePath, status)
  })

  ipcMain.handle('images:list-statuses', () => {
    requireOpenProject()
    return projectDatabase.listImageStatuses()
  })

  ipcMain.handle('shapes:list', (_, relativePath: string) => {
    requireOpenProject()
    return projectDatabase.listShapes(relativePath)
  })

  ipcMain.handle(
    'shapes:replace-image',
    (
      _,
      relativePath: string,
      rectangles: SaveRectangleInput[],
      masks: { input: SaveMaskInput; data: ArrayBuffer }[],
      polygons: SavePolygonInput[],
      imageWidth?: number,
      imageHeight?: number
    ) => {
      requireOpenProject()
      const maskBuffers = masks.map((mask) => ({
        input: mask.input,
        data: Buffer.from(mask.data)
      }))
      return projectDatabase.replaceImageShapes(
        relativePath,
        rectangles,
        maskBuffers,
        polygons,
        imageWidth,
        imageHeight
      )
    }
  )

  ipcMain.handle('masks:get', (_, shapeId: string) => {
    requireOpenProject()
    return projectDatabase.getMaskBlob(shapeId)
  })

  ipcMain.handle('semantic-masks:get', (_, relativePath: string) => {
    requireOpenProject()
    const blob = projectDatabase.getSemanticMask(relativePath)
    if (!blob) return null
    const classMap = projectDatabase.decodeSemanticMask(blob)
    return {
      width: blob.width,
      height: blob.height,
      data: classMap.buffer.slice(
        classMap.byteOffset,
        classMap.byteOffset + classMap.byteLength
      ) as ArrayBuffer
    }
  })

  ipcMain.handle(
    'semantic-masks:save',
    (_, relativePath: string, width: number, height: number, classMap: ArrayBuffer) => {
      requireOpenProject()
      const data = new Uint16Array(classMap)
      return projectDatabase.saveSemanticMask(relativePath, width, height, data)
    }
  )
}

export function closeProjectDatabase(): void {
  projectDatabase.close()
}
