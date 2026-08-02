/**
 * vite.renderer.dev.config.ts
 *
 * QA 전용 — renderer 단독 Vite dev 서버 설정.
 * electron-vite 없이 :5175 HTTP 서버로 기동.
 *
 * 사용:
 *   cd clients/desktop
 *   $env:VITE_API_BASE_URL='http://localhost:8080'
 *   $env:VITE_APP_VERSION='2026/07/26-92700'
 *   .\node_modules\.bin\vite.cmd dev --config vite.renderer.dev.config.ts
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { resolveBuildAppVersion } = require('../../scripts/app-build-version.cjs') as {
  resolveBuildAppVersion: (options: { variable: string }) => string
}
const appVersion = resolveBuildAppVersion({ variable: 'VITE_APP_VERSION' })

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/renderer'),
  // renderer root이 src/renderer이므로 실 앱/Electron과 동일한 정적 인쇄 자산을 사용한다.
  publicDir: resolve(__dirname, 'public'),
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      // PWA 가상 모듈 stub — 이 QA 서버는 VitePWA 플러그인을 태우지 않는다.
      'virtual:pwa-register': resolve(__dirname, 'playwright/support/pwa-register-stub.ts'),
    },
  },
  server: {
    port: 5175,
    strictPort: true,
    host: '127.0.0.1',
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    // electron IPC stub — process.env 대체
    'process.env': '{}',
  },
})
