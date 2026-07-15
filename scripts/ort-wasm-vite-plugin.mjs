import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const ORT_PREFIX = '/wasm/'

function ortDistDir(root) {
  return resolve(root, 'node_modules/onnxruntime-web/dist')
}

function isOrtAsset(name) {
  return (
    name.startsWith('ort-wasm-simd-threaded') && (name.endsWith('.mjs') || name.endsWith('.wasm'))
  )
}

function contentType(file) {
  if (file.endsWith('.mjs') || file.endsWith('.js')) return 'text/javascript'
  if (file.endsWith('.wasm')) return 'application/wasm'
  return 'application/octet-stream'
}

/**
 * Serve / copy onnxruntime-web WASM glue so ORT can dynamic-import them.
 * Vite's /public files cannot be imported as ES modules, so we must not put
 * the .mjs glue there.
 *
 * @param {string} projectRoot
 * @returns {import('vite').Plugin}
 */
export function ortWasmAssets(projectRoot) {
  const distDir = ortDistDir(projectRoot)

  return {
    name: 'ort-wasm-assets',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(ORT_PREFIX)) {
          next()
          return
        }

        const fileName = decodeURIComponent(req.url.slice(ORT_PREFIX.length).split('?')[0] ?? '')
        if (!fileName || fileName.includes('..') || !isOrtAsset(fileName)) {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        const filePath = resolve(distDir, fileName)
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        res.setHeader('Content-Type', contentType(fileName))
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(filePath).pipe(res)
      })
    },
    generateBundle() {
      if (!existsSync(distDir)) return
      for (const file of readdirSync(distDir)) {
        if (!isOrtAsset(file)) continue
        this.emitFile({
          type: 'asset',
          fileName: `wasm/${file}`,
          source: readFileSync(resolve(distDir, file))
        })
      }
    },
    transform(code, id) {
      if (!id.includes('onnxruntime-web')) return
      if (extname(id) === '.wasm') return
      const replaced = code.replace(
        /new URL\("ort-wasm[^"]*\.wasm",import\.meta\.url\)/g,
        'new URL("data:,")'
      )
      if (replaced !== code) return replaced
    }
  }
}
