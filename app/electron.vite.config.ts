import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          engine: resolve('src/engine/worker.ts'),
        },
      },
    },
  },
  preload: {},
  renderer: {
    plugins: [react()],
  },
})
