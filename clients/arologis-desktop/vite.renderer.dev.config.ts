/**
 * arologis-desktop 렌더러 전용 vite dev 설정 (실서버 GUI QA 용).
 *
 * electron.vite.config.ts 의 renderer 블록을 브라우저 단독 구동으로 재사용한다.
 * 프로덕션은 리버스프록시가 `/api/arologis/**` → arologis-service `/admin/arologis/**` 로 rewrite 하므로,
 * 로컬 dev 에서는 vite proxy 로 동일 rewrite 를 재현해 **실 arologis-service(:8097)** 의 실데이터를 받는다.
 * (합성/fixture 아님 — 실 엔드포인트 응답.)
 *
 * 구동: node_modules/.bin/vite dev --config vite.renderer.dev.config.ts --port 5291 --strictPort
 * (VITE_AROLOGIS_API_BASE='' 로 apiClient 를 상대경로화해 아래 proxy 를 타게 함.)
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const AROLOGIS_API = 'http://localhost:8097'
const versionApiBaseUrl = (process.env['VITE_VERSION_API_BASE_URL'] || 'http://localhost:8080').replace(/\/+$/, '')

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  define: {
    'import.meta.env.VITE_VERSION_API_BASE_URL': JSON.stringify(versionApiBaseUrl),
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  server: {
    proxy: {
      // 렌더러 apiClient 의 `/api/arologis/**`(서브패스) → arologis-service `/admin/arologis/**`.
      // ⚠️ 정규식 key + 슬래시 필수 — 그래야 vite 소스 모듈 `/api/arologis.ts`,`/api/arologisPermissions.ts`
      //    등을 가로채지 않는다(슬래시 없는 모듈 요청은 vite 가 서빙).
      '^/api/arologis/.*': {
        target: AROLOGIS_API,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/arologis/, '/admin/arologis'),
      },
      // 렌더러 apiClient 가 `/admin/arologis/**` 를 직접 호출하는 경우(배차 상세 #804·
      // 대다수 sibling 클라이언트) → arologis-service 실 엔드포인트로 rewrite 없이 통과.
      // (src/renderer/api/*.ts 소스 모듈은 슬래시 없는 경로라 이 정규식에 안 걸린다.)
      '^/admin/arologis/.*': { target: AROLOGIS_API, changeOrigin: true },
      // 인증 직접 경로 (bootstrap /auth/me·/auth/refresh 대비, rewrite 없이 통과)
      '^/auth/.*': { target: AROLOGIS_API, changeOrigin: true },
    },
  },
})
