/**
 * dev/mock 서버(`npx vite src/renderer` — Playwright mock 회귀 hard gate)가 사용하는 기본 vite config.
 *
 * vite-plugin-pwa 의 `virtual:pwa-register` 는 **build 모드에서만** 제공된다(dev serve 는 devOptions.enabled
 * 필요 → dev service worker 생성 → mock/page.route 간섭 위험). 따라서 dev/mock 서버에서는 SW 없이
 * `virtual:pwa-register` 를 **no-op stub** 으로 해석해 main.tsx(→ PwaUpdatePrompt) import 만 만족시킨다.
 *   - 프로덕션 PWA = `vite.web.config.ts`(VitePWA full → 실제 registerSW + SW 생성)
 *   - Electron 빌드 = `electron.vite.config.ts`(VitePWA disable → no-op)
 *   - dev/mock 서버 = 본 파일(stub → no-op, SW 없음)
 * 나머지(JSX 변환·root·VITE_MOCK_MODE)는 vite 기본 동작 유지(최소 변경).
 */
import { defineConfig, type Plugin } from 'vite'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const packageJson = require('./package.json') as { version: string }

function pwaRegisterDevStub(): Plugin {
  const id = 'virtual:pwa-register'
  const resolved = '\0' + id
  return {
    name: 'pwa-register-dev-stub',
    // enforce:'pre' 로 Vite 코어 `vite:resolve` 보다 먼저 실행돼야 `virtual:pwa-register` 를
    // 일반 npm 패키지로 오인(‘Failed to resolve import’)하기 전에 stub 으로 가로챈다. 미지정 시
    // dev serve/real-qa 렌더러 부팅 실패(#765).
    enforce: 'pre',
    resolveId(source) {
      if (source === id) return resolved
    },
    load(thisId) {
      if (thisId === resolved) {
        // PwaUpdatePrompt 의 registerSW({onNeedRefresh,onOfflineReady}) 시그니처에 맞춘 no-op.
        return 'export function registerSW(){ return async () => {} }'
      }
    },
  }
}

export default defineConfig({
  plugins: [pwaRegisterDevStub()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
  },
})
