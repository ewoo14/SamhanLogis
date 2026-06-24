/**
 * 데스크톱 renderer 의 웹 배포용 Vite 빌드 설정.
 *
 * Electron main/preload/print-renderer entry 는 제외하고 React renderer 만
 * `dist/web` 으로 산출한다. 인증은 authProvider web 구현(httpOnly 쿠키)을 사용한다.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/renderer'),
  base: '/',
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  define: {
    'import.meta.env.VITE_PLATFORM': JSON.stringify('web'),
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
      process.env['VITE_API_BASE_URL'] ?? 'http://localhost:8080',
    ),
    'process.env': '{}',
  },
  build: {
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html'),
    },
  },
})
