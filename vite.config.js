import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

const root = fileURLToPath(new URL('.', import.meta.url))

// `npm run build` -> normal build for GitHub Pages (base './')
// `npm run build:single` -> one self-contained HTML file (demo/sharing)
export default defineConfig(({ mode }) => ({
  base: './',
  // fixed port so it matches the redirect URI in the Entra app registration
  server: { port: 5173, strictPort: true },
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: mode === 'single'
    ? { assetsInlineLimit: 100_000_000, outDir: 'dist-single' }
    : {
        rollupOptions: {
          input: {
            main: resolve(root, 'index.html'),
            redirect: resolve(root, 'redirect.html'),
          },
        },
      },
}))
