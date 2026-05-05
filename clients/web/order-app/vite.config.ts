/**
 * Vite + PWA 빌드 설정 — clients/web/order-app.
 *
 * <p>거래처 주문서 web app (legacy partner-order index.html 1:1 모방).
 *
 * <p>주요 의도:
 * - PWA (vite-plugin-pwa) — manifest + service worker (offline cache + install prompt)
 * - alias `@` → src
 * - dev server proxy → api-gateway (8080), product-service direct (8081)
 *   * 단, 거래처 web 환경은 운영에서는 nginx/edge 가 라우팅. 본 설정은 dev 전용.
 *
 * <p>VITE_API_BASE_URL 환경변수로 BASE URL override 가능.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: '삼한공조시스템 주문서',
        short_name: '주문서',
        description: '거래처용 주문서 작성 web app — 홈멀티 / 싱글세트 / 상업멀티 / 구형',
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
