import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { resolveBuildAppVersion } = require('../../../scripts/app-build-version.cjs') as {
  resolveBuildAppVersion: (options: { variable: string }) => string
}
const appVersion = resolveBuildAppVersion({ variable: 'VITE_APP_VERSION' })
const versionApiBaseUrl = process.env.VITE_VERSION_API_BASE_URL || 'http://localhost:8080'

// 모바일 공개 서명 웹앱 — 운영은 nginx 정적 서빙(sign.samhan-air.com), dev 는 proxy → api-gateway(8080).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.VITE_VERSION_API_BASE_URL': JSON.stringify(versionApiBaseUrl),
  },
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  server: {
    port: 5185,
    host: true,
    proxy: { '/api': { target: process.env['VITE_DEV_PROXY_TARGET'] ?? 'http://localhost:8080', changeOrigin: true } },
  },
  preview: { port: 5186 },
  build: { outDir: 'dist', sourcemap: mode === 'development', target: 'es2020' },
}))
