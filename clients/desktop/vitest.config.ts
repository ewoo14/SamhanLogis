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
    // Windows CI에서 기본 worker pool이 테스트 완료 후 child worker 정리를 지연시켜
    // 62/62 PASS가 shell timeout으로 위장한 적이 있다. desktop 가드는 파일 전체를
    // 병렬 실행할 이득보다 단일 fork의 명시적 종료가 중요하다.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    reporters: 'default',
    passWithNoTests: false,
  },
})
