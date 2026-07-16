import { protocol } from 'electron'

export const LOCAL_IMAGE_SCHEME = 'local-image'
export const WEBSAM_MODEL_SCHEME = 'websam-model'
export const RENDERER_SCHEME = 'lee-label'

const resourcePrivileges = {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  stream: true,
  corsEnabled: true
} as const

/** Register every custom scheme together, before Electron's ready event. */
export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: LOCAL_IMAGE_SCHEME, privileges: resourcePrivileges },
    { scheme: WEBSAM_MODEL_SCHEME, privileges: resourcePrivileges },
    {
      scheme: RENDERER_SCHEME,
      privileges: {
        ...resourcePrivileges,
        codeCache: true
      }
    }
  ])
}
