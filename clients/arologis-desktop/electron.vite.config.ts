/**
 * arologis-desktop electron-vite 빌드 설정.
 *
 * 세 entry (main / preload / renderer) 분리. Samhan Public 의 desktop 패턴 복제이되
 * legacy webview / 종합견적서 IPC 는 제거 (배차 도메인 전용).
 *
 * - main: Electron 메인 프로세스 ESM
 * - preload: sandbox:true 에서 로드 가능한 CommonJS(.cjs)
 * - renderer: React + Vite, ESM
 *
 * `VITE_AROLOGIS_API_BASE` 환경변수가 axios baseURL 로 주입된다.
 * 예: production = `https://api.arologis.samhan-air.com`
 */
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { resolveBuildAppVersion } = require('../../scripts/app-build-version.cjs') as {
  resolveBuildAppVersion: (options?: { env?: NodeJS.ProcessEnv; variable?: string }) => string
}
const appVersion = resolveBuildAppVersion({ variable: 'VITE_APP_VERSION' })
const versionApiBaseUrl = (process.env['VITE_VERSION_API_BASE_URL'] || 'http://localhost:8080').replace(/\/+$/, '')

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
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
        output: {
          // 샌드박스 preload(sandbox:true)는 ESM(.mjs)을 로드하지 못하므로
          // CommonJS(.cjs)로 출력해 packaged(file://) white-screen 회귀를 막는다.
          entryFileNames: '[name].cjs',
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      'import.meta.env.VITE_VERSION_API_BASE_URL': JSON.stringify(versionApiBaseUrl),
    },
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
