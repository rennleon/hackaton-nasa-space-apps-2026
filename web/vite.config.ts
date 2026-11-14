/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const appVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string

// The API always stays on the loopback interface; the browser reaches it only through this
// same-origin /api proxy (dev server and `vite preview` alike), so it is never exposed directly.
const apiPort = process.env.API_PORT || '8000'
const apiProxy = {
  '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api/, '') },
}

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) }, // shown in the footer (see RELEASING.md)
  server: {
    // `npm run dev` + `uv run uvicorn trend_detective.api:app` (port 8000): the app calls /api/* with no env setup.
    proxy: apiProxy,
  },
  preview: {
    // `npm run lan` serves the production build to the local network with the same proxy.
    proxy: apiProxy,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
})
