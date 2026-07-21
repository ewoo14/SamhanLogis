/**
 * playwright.real-qa.config.ts
 *
 * 실서버 QA 전용 Playwright 설정.
 * testIgnore 없이 *-real-qa.spec.ts 파일을 직접 실행한다.
 *
 * 사용:
 *   cd clients/desktop
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts --reporter=line --timeout=60000
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './playwright',
  // 이번 슬라이스의 real-QA 5건만 실행한다. 전체 real-QA 묶음은 서로 다른
  // 외부 상태와 전제를 가지므로 이 config에 섞으면 D3 상태 격리 검증이 흐려진다.
  testMatch: ['**/825-s5-null-semantics-real-qa/825-s5-null-semantics-real-qa.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  timeout: 60000,
})
