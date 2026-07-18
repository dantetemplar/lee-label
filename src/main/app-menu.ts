import { BrowserWindow, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import type { AppMenuAction, AppMenuState } from '../shared/menu'

const GITHUB_URL = 'https://github.com/dantetemplar/lee-label'

let menuState: AppMenuState = {
  hasOpenProject: false,
  recentProjects: []
}

function sendMenuAction(action: AppMenuAction, payload?: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send('menu:action', action, payload)
}

function buildTemplate(): MenuItemConstructorOptions[] {
  const recentSubmenu: MenuItemConstructorOptions[] =
    menuState.recentProjects.length > 0
      ? menuState.recentProjects.map((project) => ({
          label: project.label,
          click: () => sendMenuAction('open-recent', project.path)
        }))
      : [{ label: 'No Recent Projects', enabled: false }]

  return [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        {
          id: 'go-to-welcome',
          label: 'Go to Welcome Screen',
          enabled: menuState.hasOpenProject,
          click: () => sendMenuAction('go-to-welcome')
        },
        {
          label: 'Open Folder…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenuAction('open-folder')
        },
        {
          id: 'open-recent',
          label: 'Open Recent',
          submenu: recentSubmenu
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Project',
      submenu: [
        {
          id: 'project-settings',
          label: 'Settings…',
          enabled: menuState.hasOpenProject,
          click: () => sendMenuAction('project-settings')
        }
      ]
    },
    {
      label: 'Import',
      submenu: [
        {
          id: 'import-annotations',
          label: 'Annotations…',
          enabled: menuState.hasOpenProject,
          click: () => sendMenuAction('import-annotations')
        }
      ]
    },
    {
      label: 'Export',
      submenu: [
        {
          id: 'export-dataset',
          label: 'Dataset…',
          enabled: menuState.hasOpenProject,
          click: () => sendMenuAction('export-dataset')
        }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Platform Info…',
          click: () => sendMenuAction('platform-info')
        },
        {
          label: 'GitHub',
          click: () => {
            void shell.openExternal(GITHUB_URL)
          }
        }
      ]
    }
  ]
}

export function setupApplicationMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate()))
}

export function setAppMenuState(partial: Partial<AppMenuState>): void {
  if (process.platform !== 'darwin') return
  menuState = {
    hasOpenProject: partial.hasOpenProject ?? menuState.hasOpenProject,
    recentProjects: partial.recentProjects ?? menuState.recentProjects
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate()))
}
