import { app, shell, BrowserWindow, ipcMain, dialog, nativeImage, session } from 'electron'
import { readdir, stat } from 'fs/promises'
import { isAbsolute, join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { FileEntry } from '../shared/types'
import { readTextFile, writeTextFile, readBinaryFile } from './file-io'
import { setupImageProtocol } from './image-protocol'
import { setupWebsamModelProtocol, registerModelsIpc } from './models-ipc'
import { registerPrivilegedSchemes } from './protocols'
import { getRendererUrl, setupRendererProtocol } from './renderer-protocol'
import {
  addRecentProject,
  getRecentProjects,
  isExistingDirectory,
  removeRecentProject
} from './recent-projects'
import { APP_DISPLAY_NAME } from '../shared/app-name'
import { formatDisplayPath } from '../shared/paths'
import { closeProjectDatabase, registerAnnotationsIpc } from './annotations-ipc'
import { registerImportIpc } from './import-ipc'
import { registerExportIpc } from './export-ipc'
import { resolveProjectPath } from './project-fs'

registerPrivilegedSchemes()

/** WebGPU flags must run synchronously before app.ready (no await above). */
function configureGpuCommandLine(): void {
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  app.commandLine.appendSwitch('enable-unsafe-webgpu')
  // NVIDIA Vulkan: Dawn disables shader-f16 by default; allow fp16 WebGPU models.
  app.commandLine.appendSwitch('enable-dawn-features', 'vulkan_enable_f16_on_nvidia')
}

configureGpuCommandLine()

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
    if (entry.name === '.lee-label') continue
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

function openAuxiliaryBrowserWindow(url: string, title: string): void {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    title,
    icon: appIcon.isEmpty() ? undefined : appIcon,
    webPreferences: {
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  void win.loadURL(url)
}

function openChromeGpuWindow(): void {
  openAuxiliaryBrowserWindow('chrome://gpu', 'GPU Internals')
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

  ipcMain.handle('shell:open-external', async (_, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Only http(s) URLs can be opened')
    }
    await shell.openExternal(url)
  })

  ipcMain.handle('shell:open-in-app', (_, url: string, title?: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Only http(s) URLs can be opened in-app')
    }
    openAuxiliaryBrowserWindow(url, typeof title === 'string' && title.length > 0 ? title : url)
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
    const resolved = resolveProjectPath(rootPath)
    return readDirTree(resolved)
  })

  ipcMain.handle('fs:read-text-file', async (_, filePath: string) => {
    const resolved = resolveProjectPath(filePath)
    return readTextFile(resolved)
  })

  ipcMain.handle('fs:read-binary-file', async (_, filePath: string) => {
    // Absolute paths only — same reach as local-image:// (project images may live anywhere).
    if (typeof filePath !== 'string' || !isAbsolute(filePath)) {
      throw new Error('Absolute path required')
    }
    return readBinaryFile(resolve(filePath))
  })

  ipcMain.handle('fs:write-text-file', async (_, filePath: string, content: string) => {
    const resolved = resolveProjectPath(filePath)
    return writeTextFile(resolved, content)
  })

  ipcMain.handle('recent:get', async () => {
    return getRecentProjects()
  })

  ipcMain.handle('recent:add', async (_, path: string) => {
    return addRecentProject(path)
  })

  ipcMain.handle('recent:remove', async (_, path: string) => {
    return removeRecentProject(path)
  })

  ipcMain.handle('recent:exists', async (_, path: string) => {
    return isExistingDirectory(path)
  })

  ipcMain.handle('paths:format-display', (_, path: string) => {
    return formatDisplayPath(path, app.getPath('home'))
  })

  ipcMain.handle('runtime:get-info', () => ({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch
  }))

  ipcMain.handle('gpu:get-feature-status', () => app.getGPUFeatureStatus())

  ipcMain.handle('gpu:open-chrome-gpu', () => {
    openChromeGpuWindow()
  })
}

function attachRendererConsole(webContents: BrowserWindow['webContents']): void {
  webContents.on('console-message', ({ level, message, lineNumber, sourceId }) => {
    const location = sourceId ? ` (${sourceId}:${lineNumber})` : ''
    const line = `[renderer:${level}] ${message}${location}`
    if (level === 'error') {
      console.error(line)
      return
    }
    if (level === 'warning') {
      console.warn(line)
      return
    }
    console.log(line)
  })

  webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] process gone:', details.reason, details)
  })

  webContents.on('unresponsive', () => {
    console.error('[renderer] window became unresponsive')
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

  if (is.dev) {
    attachRendererConsole(mainWindow.webContents)
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
    mainWindow.loadURL(getRendererUrl())
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron.app')

  // COOP/COEP so renderer is crossOriginIsolated → ORT WASM can use threads.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    headers['Cross-Origin-Opener-Policy'] = ['same-origin']
    headers['Cross-Origin-Embedder-Policy'] = ['require-corp']
    headers['Cross-Origin-Resource-Policy'] = ['cross-origin']
    callback({ responseHeaders: headers })
  })

  app.on('browser-window-created', (_, window) => {
    if (!appIcon.isEmpty()) {
      window.setIcon(appIcon)
    }
    optimizer.watchWindowShortcuts(window)
  })

  registerIpc()
  registerAnnotationsIpc()
  registerImportIpc()
  registerExportIpc()
  registerModelsIpc()
  setupImageProtocol()
  setupWebsamModelProtocol()
  setupRendererProtocol()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeProjectDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
