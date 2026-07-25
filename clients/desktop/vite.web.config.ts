/**
 * 데스크톱 renderer 의 웹 배포용 Vite 빌드 설정.
 *
 * Electron main/preload/print-renderer entry 는 제외하고 React renderer 만
 * `dist/web` 으로 산출한다. 인증은 authProvider web 구현(httpOnly 쿠키)을 사용한다.
 */
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { resolveBuildAppVersion } = require('../../scripts/app-build-version.cjs') as {
  resolveBuildAppVersion: (options: { variable: string }) => string
}
const appVersion = resolveBuildAppVersion({ variable: 'VITE_APP_VERSION' })

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Samhan Public 백오피스',
        short_name: '삼한',
        lang: 'ko',
        description: '삼한 퍼블릭 사내 운영 백오피스',
        theme_color: '#2D77A8',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/auth/, /^\/collab/],
        runtimeCaching: [
          {
            // default-deny: 앱셸(precache) 외 동일출처 비-navigation 요청(데이터/API/collab 중첩경로 포함)은
            // 전부 캐시 금지(NetworkOnly) — 실시간 데이터·RBAC stale 누출 차단 + 후속 오프라인 phase 캐싱 footgun 방지.
            // precache 라우팅이 우선하므로 빌드 asset은 영향 없음. (cross-origin :8080 게이트웨이는 SW 미인터셉트라 이중 안전.)
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && request.mode !== 'navigate',
            handler: 'NetworkOnly',
          },
        ],
      },
    }) as unknown as PluginOption,
  ],
  root: resolve(__dirname, 'src/renderer'),
  publicDir: resolve(__dirname, 'public'),
  base: '/',
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  define: {
    'import.meta.env.VITE_PLATFORM': JSON.stringify('web'),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
      process.env['VITE_API_BASE_URL'] ?? 'http://localhost:8080',
    ),
    'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] ?? 'production'),
  },
  build: {
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html'),
    },
  },
})
