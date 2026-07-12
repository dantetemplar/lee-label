import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { YoloImportOptions } from '../shared/import'
import { projectDatabase } from './db/project-db'
import { importYoloUltralytics, previewYoloUltralytics } from './import/yolo-ultralytics'

function requireOpenProject(): void {
  if (!projectDatabase.getRootPath()) {
    throw new Error('No project is open')
  }
}

export function registerImportIpc(): void {
  ipcMain.handle('dialog:open-file', async (event, filters?: Electron.FileFilter[]) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: filters ?? [{ name: 'All Files', extensions: ['*'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('import:yolo-ultralytics-preview', async (_, options: YoloImportOptions) => {
    requireOpenProject()
    return previewYoloUltralytics(options)
  })

  ipcMain.handle('import:yolo-ultralytics', async (_, options: YoloImportOptions) => {
    requireOpenProject()
    return importYoloUltralytics(options)
  })
}
