/**
 * Phase F (D-DF-06) — print-renderer 정적 빌드 전용 Vite 설정.
 *
 * 본 설정은 electron-vite (electron.vite.config.ts) 와 **별도** 로 동작한다.
 * 이유: electron-vite 의 renderer 는 Electron BrowserWindow 전용 빌드 (file:// 로딩 + IPC 의존)
 *       이며, Phase F 사본 합성용 print-renderer 는 Playwright Chromium headless 가 file:// 로
 *       단독 로드하는 진입점이라 의존성/CSP/preload 가 불필요하다.
 *       격리된 별도 빌드로 산출하여 dist/print-renderer/ 에 자기-완결형 번들 생성.
 *
 * Docker Stage 1 (services/arologis-service/Dockerfile) 가 본 설정으로 빌드한 산출물을
 * `/app/print-renderer/` 에 동봉, PlaywrightCopyRenderer 가 file:///app/print-renderer/index.html
 * 로 goto 하여 사본 PNG 합성.
 *
 * 빌드: `npm run build:print-renderer` → `dist/print-renderer/index.html` + bundle.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  // print-renderer/ 디렉토리를 root 로 → index.html + main.tsx 단일 진입점.
  root: resolve(__dirname, 'print-renderer'),
  // file:// 환경에서 동작하려면 절대 경로 (/) 가 아닌 상대 경로 (./) 로 asset 참조 필요.
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/print-renderer'),
    emptyOutDir: true,
    // Playwright headless 가 단일 페이지로 즉시 로드 — chunk split 비활성으로 단순화.
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
})
