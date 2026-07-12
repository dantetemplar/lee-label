import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { YoloExportOptions } from '../shared/export'
import { projectDatabase } from './db/project-db'
import { exportYoloUltralytics, previewYoloUltralytics } from './export/yolo-ultralytics'

function requireOpenProject(): void {
  if (!projectDatabase.getRootPath()) {
    throw new Error('No project is open')
  }
}

let activeExportAbort: AbortController | null = null

export function registerExportIpc(): void {
  ipcMain.handle('dialog:save-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('export:yolo-ultralytics-preview', async (_, options: YoloExportOptions) => {
    requireOpenProject()
    return previewYoloUltralytics(options)
  })

  ipcMain.handle('export:yolo-ultralytics', async (event, options: YoloExportOptions) => {
    requireOpenProject()
    activeExportAbort?.abort()
    const controller = new AbortController()
    activeExportAbort = controller

    try {
      return await exportYoloUltralytics(options, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('export:yolo-ultralytics-progress', progress)
          }
        }
      })
    } finally {
      if (activeExportAbort === controller) {
        activeExportAbort = null
      }
    }
  })

  ipcMain.handle('export:yolo-ultralytics-cancel', () => {
    activeExportAbort?.abort()
  })
}
