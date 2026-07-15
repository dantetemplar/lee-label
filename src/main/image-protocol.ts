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
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

export function setupImageProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    const filePath = decodeURIComponent(new URL(request.url).searchParams.get('path') ?? '')
    if (!filePath) {
      return new Response('Not found', { status: 404 })
    }

    const response = await net.fetch(pathToFileURL(filePath).href)
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  })
}
