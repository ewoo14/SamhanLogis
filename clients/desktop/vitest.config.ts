import { defineConfig } from 'vitest/config'

/**
 * desktop vitest 설정.
 *
 * 결재문서 인쇄 헬퍼와 전표번호 유틸처럼 DOM 이 필요 없는 순수 함수 단위 테스트를
 * node 환경에서 실행한다. production typecheck 는 tsconfig 의 `*.test.ts` exclude 로 분리한다.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    reporters: 'default',
    passWithNoTests: false,
  },
})
