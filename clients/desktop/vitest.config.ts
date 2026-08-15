import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

/**
 * desktop vitest 설정.
 *
 * 결재문서 인쇄 헬퍼와 전표번호 유틸처럼 DOM 이 필요 없는 순수 함수 단위 테스트를
 * node 환경에서 실행한다. production typecheck 는 tsconfig 의 `*.test.ts` exclude 로 분리한다.
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
    environment: 'node',
    // Electron/jsdom tests use module-level mocks and Zustand singletons. A
    // shared fork leaks those registries across files; the default threaded
    // workers keep file state isolated and exit cleanly on Windows CI.
    pool: 'threads',
    isolate: true,
    reporters: 'default',
    passWithNoTests: false,
  },
})
