/**
 * Vite + PWA 빌드 설정 — clients/web/order-app v4 (legacy partner-order/index.html 임베드).
 *
 * <p>핵심 변경 (v3 → v4):
 * - React plugin 폐기 (legacy 가 plain JS / Vanilla DOM 만 사용)
 * - root index.html = legacy partner-order/index.html (9427 라인) 그대로 +
 *   `<script type="module" src="/src/main.ts">` 한 줄 + Apps Script 템플릿 → __SAMHAN_BOOTSTRAP__
 * - main.ts 는 shim (window.google.script.run → samhanApi axios) + 부트스트랩 prefetch 만 담당
 *
 * <p>주요 의도:
 * - PWA (vite-plugin-pwa) — manifest + service worker (offline cache + install prompt) 보존
 * - alias `@` → src
 * - dev server proxy → api-gateway (8080) (운영은 nginx/edge 라우팅, 본 설정은 dev 전용)
 *
 * <p>VITE_API_BASE_URL 환경변수로 BASE URL override 가능.
 */
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

process.env.VITE_API_BASE_URL = process.env.VITE_API_BASE_URL || '/api/v1'
const require = createRequire(import.meta.url)
const { resolveBuildAppVersion } = require('../../../scripts/app-build-version.cjs') as {
  resolveBuildAppVersion: (options: { variable: string }) => string
}
const appVersion = resolveBuildAppVersion({ variable: 'VITE_APP_VERSION' })
const versionApiBaseUrl = (process.env.VITE_VERSION_API_BASE_URL || process.env.VITE_API_BASE_URL || 'http://localhost:8080')
  .replace(/\/+$/, '')
  .replace(/\/api\/v1$/, '')

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: '삼한공조시스템 주문서',
        short_name: '주문서',
        description: '거래처용 주문서 작성 web app — 홈멀티 / 싱글중대형 / 상업멀티 / 구형',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'ko',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        runtimeCaching: [
          {
            // 거래처 마스터 + 카테고리 카탈로그 cache (offline 진입 시 마지막 데이터)
            urlPattern: /\/api\/v1\/(products|partner-orders\/catalog)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'samhan-catalog-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24, // 24h
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.VITE_VERSION_API_BASE_URL': JSON.stringify(versionApiBaseUrl),
  },
  server: {
    port: 5180,
    host: true,
  },
  preview: {
    port: 5181,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
  },
})
