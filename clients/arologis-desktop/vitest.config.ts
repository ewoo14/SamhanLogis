import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

/**
 * arologis-desktop vitest 설정.
 *
 * renderer 권한 유틸과 React 컴포넌트 단위 테스트를 jsdom 환경에서 실행한다.
 *
 * `@samhan/design-system` 는 심볼릭 링크로 연결되어 있고 자체 `node_modules/react`
 * 를 가지므로, alias 없이 그대로 import 하면 arologis-desktop 의 react 사본과
 * 중복되어 "Invalid hook call"(useId 등) 크래시가 난다. desktop 클라이언트의
 * `clients/desktop/vitest.config.ts` 와 동일한 처방 — 소스(`src/index.ts`)로 직접
 * alias + react/react-dom dedupe.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@samhan/design-system': resolve(__dirname, '../web/design-system/src/index.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    reporters: 'default',
    passWithNoTests: false,
  },
})
