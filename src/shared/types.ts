export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  children?: FileEntry[]
}

export interface RecentProject {
  path: string
  name: string
  displayPath: string
  openedAt: number
}
