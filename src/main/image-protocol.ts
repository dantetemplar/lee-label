import { net, protocol } from 'electron'
import { pathToFileURL } from 'url'

const SCHEME = 'local-image'

export function registerImageProtocolSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ])
}

export function setupImageProtocol(): void {
  protocol.handle(SCHEME, (request) => {
    const filePath = decodeURIComponent(new URL(request.url).searchParams.get('path') ?? '')
    if (!filePath) {
      return new Response('Not found', { status: 404 })
    }

    return net.fetch(pathToFileURL(filePath).href)
  })
}
