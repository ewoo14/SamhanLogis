/**
 * electron-vite 빌드 설정.
 *
 * 세 entry (main / preload / renderer) 를 한 번에 빌드하며,
 * 산출물은 `out/main`, `out/preload`, `out/renderer` 로 분리된다.
 *
 * - main / preload: Node 17+ 타깃, CommonJS
 * - renderer: React + Vite, ESM, `src/renderer` 가 root
 *
 * `VITE_API_BASE_URL` 환경변수는 renderer 빌드 타임/런타임에 주입되어
 * `import.meta.env.VITE_API_BASE_URL` 로 axios baseURL 에 사용된다.
 */
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { PluginOption } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve(__dirname, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      // [Phase 6 v4] preload 2 entry — main BrowserWindow 용 (index) + legacy
      // estimate webview 전용 (legacyShim, contextBridge 로 google.script.run 주입).
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          legacyShim: resolve(__dirname, 'src/preload/legacyShim.ts'),
        },
        output: {
          entryFileNames: '[name].mjs',
          format: 'es',
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), VitePWA({ disable: true }) as unknown as PluginOption],
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
      },
    },
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
})
