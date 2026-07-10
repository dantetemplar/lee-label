import { join } from 'path'

export const DB_FILENAME = 'lee-label.sqlite'

export function getDbPath(projectRoot: string): string {
  return join(projectRoot, DB_FILENAME)
}
