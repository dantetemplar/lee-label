import { app, shell, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { FileEntry } from '../shared/types'
import { readTextFile, writeTextFile } from './file-io'
import { registerImageProtocolSchemes, setupImageProtocol } from './image-protocol'
import { addRecentProject, getRecentProjects, isExistingDirectory } from './recent-projects'
import { APP_DISPLAY_NAME } from '../shared/app-name'

registerImageProtocolSchemes()

const appIcon = nativeImage.createFromPath(icon)

if (process.platform === 'linux') {
  app.setDesktopName('lee-label')
}

app.setName(APP_DISPLAY_NAME)

async function readDirTree(dirPath: string): Promise<FileEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const nodes: FileEntry[] = []

  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })

  for (const entry of sorted) {
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const children = await readDirTree(fullPath)
      nodes.push({ name: entry.name, path: fullPath, type: 'directory', children })
    } else {
      const stats = await stat(fullPath)
      nodes.push({ name: entry.name, path: fullPath, type: 'file', size: stats.size })
    }
  }

  return nodes
}

function registerIpc(): void {
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    if (win.isMaximized()) {
      win.unmaximize()
      return false
    }
    win.maximize()
    return true
  })

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window:is-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  ipcMain.handle('dialog:open-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('fs:read-directory-tree', async (_, rootPath: string) => {
    return readDirTree(rootPath)
  })

  ipcMain.handle('fs:read-text-file', async (_, filePath: string) => {
    return readTextFile(filePath)
  })

  ipcMain.handle('fs:write-text-file', async (_, filePath: string, content: string) => {
    return writeTextFile(filePath, content)
  })

  ipcMain.handle('recent:get', async () => {
    return getRecentProjects()
  })

  ipcMain.handle('recent:add', async (_, path: string) => {
    return addRecentProject(path)
  })

  ipcMain.handle('recent:exists', async (_, path: string) => {
    return isExistingDirectory(path)
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (!appIcon.isEmpty()) {
    mainWindow.setIcon(appIcon)
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  const sendMaximized = (): void => {
    mainWindow.webContents.send('window:maximized-changed', mainWindow.isMaximized())
  }
  mainWindow.on('maximize', sendMaximized)
  mainWindow.on('unmaximize', sendMaximized)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron.app')

  app.on('browser-window-created', (_, window) => {
    if (!appIcon.isEmpty()) {
      window.setIcon(appIcon)
    }
    optimizer.watchWindowShortcuts(window)
  })

  registerIpc()
  setupImageProtocol()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
