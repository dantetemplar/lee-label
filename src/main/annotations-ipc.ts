import { ipcMain } from 'electron'
import type {
  CreateLabelInput,
  ImageStatus,
  SaveMaskInput,
  SaveRectangleInput,
  UpdateLabelInput
} from '../shared/annotations'
import { projectDatabase } from './db/project-db'

function requireOpenProject(): void {
  if (!projectDatabase.getRootPath()) {
    throw new Error('No project is open')
  }
}

export function registerAnnotationsIpc(): void {
  ipcMain.handle('project:open', (_, rootPath: string) => {
    projectDatabase.open(rootPath)
    return { rootPath }
  })

  ipcMain.handle('project:close', () => {
    projectDatabase.close()
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
        imageWidth,
        imageHeight
      )
    }
  )

  ipcMain.handle('masks:get', (_, shapeId: string) => {
    requireOpenProject()
    return projectDatabase.getMaskBlob(shapeId)
  })
}

export function closeProjectDatabase(): void {
  projectDatabase.close()
}
