/**
 * Vite + PWA 빌드 설정 — clients/web/estimate-app v1 (legacy estimate/index.html 임베드).
 *
 * <p>핵심 패턴 (Web order-app v4 와 동일):
 * - React plugin 폐기 (legacy 가 plain JS / Vanilla DOM 만 사용)
 * - root index.html = legacy estimate/index.html (18614 라인) Apps Script 템플릿 변환 결과 +
 *   `<script type="module" src="/src/main.ts">` 한 줄 + `__SAMHAN_BOOTSTRAP__` 주입 컴파일러
 * - main.ts 는 shim (window.google.script.run → samhanApi axios) + 부트스트랩 prefetch 만 담당
 *
 * <p>주요 의도:
 * - PWA (vite-plugin-pwa) — manifest + service worker (offline cache + install prompt)
 *   estimate-app 은 내부 영업/관리자 위주이나 관리 PC 오프라인 회의 시나리오 대비
 * - alias `@` → src
 * - dev server proxy → api-gateway (8080) (운영은 nginx/edge 라우팅, 본 설정은 dev 전용)
 *
 * <p>VITE_API_BASE_URL 환경변수로 BASE URL override 가능.
 *
 * <p>port 5182 — order-app 5180 / 5181 과 충돌 회피.
 */
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: '삼한공조시스템 종합견적서',
        short_name: '종합견적서',
        description:
          '내부 영업/관리자용 종합견적서 작성 web app — 가정용/상업용 멀티/싱글/구형 견적 + 인쇄/이력 보관',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        // estimate 는 PC viewport 우선이므로 landscape 권장 (모바일은 cardOrderInfo 위주 단순화)
        orientation: 'landscape',
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
        // legacy estimate index.html 이 18614 라인 + 폰트/로고 inline 으로 5MB+ — workbox 한도 상향
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        runtimeCaching: [
          {
            // 거래처 마스터 + 카테고리 카탈로그 + 견적이력 cache
            urlPattern:
              /\/api\/v1\/(products|partners|estimates\/snapshots|partner-orders|files\/gate-images)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'samhan-estimate-cache',
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
    port: 5182,
    host: true,
  },
  preview: {
    port: 5183,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
    // legacy index.html 이 매우 큼 (5MB+ inline 폰트/로고/인감) — chunk 경고 한도 상향
    chunkSizeWarningLimit: 6000,
  },
})
