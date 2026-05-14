/**
 * arologis-desktop electron-vite 빌드 설정.
 *
 * 세 entry (main / preload / renderer) 분리. Samhan Public 의 desktop 패턴 복제이되
 * legacy webview / 종합견적서 IPC 는 제거 (배차 도메인 전용).
 *
 * `VITE_AROLOGIS_API_BASE` 환경변수가 axios baseURL 로 주입된다.
 * 예: production = `https://api.arologis.samhan-air.com`
 */
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
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
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
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
    plugins: [react()],
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
