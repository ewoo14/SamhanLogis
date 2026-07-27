/**
 * playwright.real-qa.config.ts
 *
 * 실서버 QA 전용 Playwright 설정 — repo 공유 하네스(전체 real-QA 스펙 대상).
 * testIgnore 없이 *-real-qa.spec.ts 파일을 직접 실행한다.
 *
 * 🚨 [SONNET5 R3 HIGH-2 fix] R2 가 testMatch 를 이 슬라이스 스펙 1개로 좁혀 repo 전체
 * real-QA 스펙(83개 중 82개)을 무력화했었다(공유 하네스를 슬라이스 전용으로 오염).
 * testMatch 는 다시 repo 전체 *-real-qa.spec.ts 를 대상으로 원복한다. 슬라이스 단위
 * 격리가 필요하면(서로 다른 외부 상태/전제 혼입 방지) testMatch 를 좁히지 말고 아래처럼
 * CLI 인자로 파일을 지정한다 — Playwright 는 CLI 경로 인자를 testMatch 의 교집합(추가 필터)
 * 으로만 적용하므로 testMatch 를 그대로 두고도 특정 슬라이스만 골라 실행할 수 있다.
 *
 * 사용:
 *   cd clients/desktop
 *   # 전체 real-QA 스펙(83개) 실행:
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts --reporter=line --timeout=60000
 *   # 이 슬라이스(#825 슬5)만 격리 실행:
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts --reporter=line --timeout=60000 `
 *     playwright/825-s5-null-semantics-real-qa/825-s5-null-semantics-real-qa.spec.ts
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './playwright',
  testMatch: ['**/*-real-qa.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175',
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  timeout: 60000,
})
