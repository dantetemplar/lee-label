import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'
import solid from 'vite-plugin-solid'
import { ortWasmAssets } from './scripts/ort-wasm-vite-plugin.mjs'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@logo': resolve('build/logo_icon.svg')
      }
    },
    plugins: [tailwindcss(), solid(), ortWasmAssets(resolve('.'))],
    optimizeDeps: {
      exclude: ['onnxruntime-web']
    },
    worker: {
      format: 'es',
      plugins: () => [ortWasmAssets(resolve('.'))]
    }
  }
})
