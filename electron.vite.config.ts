import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'
import solid from 'vite-plugin-solid'

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
    plugins: [tailwindcss(), solid()]
  }
})
