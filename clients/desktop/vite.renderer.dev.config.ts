/**
 * vite.renderer.dev.config.ts
 *
 * QA 전용 — renderer 단독 Vite dev 서버 설정.
 * electron-vite 없이 :5175 HTTP 서버로 기동.
 *
 * 사용:
 *   cd clients/desktop
 *   VITE_API_BASE_URL=http://localhost:8080 node_modules/.bin/vite dev --config vite.renderer.dev.config.ts
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { PluginOption } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react(), VitePWA({ disable: true }) as unknown as PluginOption],
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  server: {
    port: 5175,
    strictPort: true,
    host: '127.0.0.1',
  },
  define: {
    // electron IPC stub — process.env 대체
    'process.env': '{}',
  },
})
