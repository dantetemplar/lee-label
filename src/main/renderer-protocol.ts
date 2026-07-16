import { net, protocol } from 'electron'
import { extname, isAbsolute, relative, resolve } from 'path'
import { pathToFileURL } from 'url'
import { RENDERER_SCHEME } from './protocols'

const RENDERER_HOST = 'app'
const RENDERER_ROOT = resolve(__dirname, '../renderer')

function notFound(): Response {
  return new Response('Not found', { status: 404 })
}

function contentType(filePath: string): string | null {
  switch (extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.wasm':
      return 'application/wasm'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.woff2':
      return 'font/woff2'
    default:
      return null
  }
}

export function setupRendererProtocol(): void {
  protocol.handle(RENDERER_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host !== RENDERER_HOST) return notFound()

    const requestedPath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
    const filePath = resolve(RENDERER_ROOT, requestedPath)
    const relativePath = relative(RENDERER_ROOT, filePath)
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) return notFound()

    const response = await net.fetch(pathToFileURL(filePath).href)
    const headers = new Headers(response.headers)
    const mime = contentType(filePath)
    if (mime) headers.set('Content-Type', mime)
    headers.set('Cross-Origin-Resource-Policy', 'same-origin')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  })
}

export function getRendererUrl(): string {
  return `${RENDERER_SCHEME}://${RENDERER_HOST}/index.html`
}
