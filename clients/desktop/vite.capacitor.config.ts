/**
 * Capacitor 네이티브 셸용 Vite 빌드 설정.
 *
 * 웹/PWA 빌드(vite.web.config.ts)를 미러하되 service worker 는 주입하지 않는다.
 * 네이티브 WebView(capacitor://localhost)는 자체 서빙을 사용하므로 SW 가 불필요하고,
 * 캐시 간섭을 피하기 위해 dist/capacitor 로 별도 산출한다.
 */
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const appVersion = process.env['VITE_APP_VERSION']?.trim() || '0.0.0'

function pwaRegisterCapacitorStub(): Plugin {
  const id = 'virtual:pwa-register'
  const resolved = '\0' + id
  return {
    name: 'pwa-register-capacitor-stub',
    resolveId(source) {
      if (source === id) return resolved
    },
    load(thisId) {
      if (thisId === resolved) {
        // Capacitor 빌드는 service worker 를 생성하지 않으므로 업데이트 프롬프트도 no-op 처리한다.
        return 'export function registerSW(){ return async () => {} }'
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), pwaRegisterCapacitorStub()],
  root: resolve(__dirname, 'src/renderer'),
  publicDir: resolve(__dirname, 'public'),
  base: '',
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  define: {
    'import.meta.env.VITE_PLATFORM': JSON.stringify('capacitor'),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
      process.env['VITE_API_BASE_URL'] ?? 'http://localhost:8080',
    ),
    'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] ?? 'production'),
  },
  build: {
    outDir: resolve(__dirname, 'dist/capacitor'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html'),
    },
  },
})
