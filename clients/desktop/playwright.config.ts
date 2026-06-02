/**
 * Playwright 설정 — Desktop 클라이언트 mock 회귀 hard gate.
 *
 * dev server 는 기본적으로 VITE_MOCK_MODE=1 로 자동 기동됨.
 * AUDIT_BASE_URL 환경 변수로 dev server 주소 재정의 가능 (기본: http://127.0.0.1:5173).
 *
 * 실행 예:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173 &
 *   npx playwright test playwright/manual/manual-capture.spec.ts --reporter=line
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './playwright',
  // opt-out 컨벤션: 실서버/실QA·수동 캡처 전용 스펙 제외(나머지 mock 회귀는 자동 게이트)
  testIgnore: [
    '**/manual/**',
    '**/full-qa/**',
    '**/audit/**',
    '**/phase-2-4-real-qa/**',
    '**/*-real-qa.spec.ts',
    // 레거시 GAS 소스 의존 스펙은 mock 회귀가 아니므로 3-A2 컨벤션 대상에서 제외한다.
    '**/full-menu-contract/**',
  ],
  timeout: 60_000,
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 2 : 1,
  reporter: process.env['CI']
    ? [['line'], ['json', { outputFile: 'playwright-report/results.json' }], ['html', { open: 'never' }]]
    : [['line'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env['PLAYWRIGHT_SKIP_WEB_SERVER'] === '1'
    ? undefined
    : {
        command: 'npx vite src/renderer --host 127.0.0.1 --port 5173',
        env: { VITE_MOCK_MODE: '1' },
        url: 'http://127.0.0.1:5173/',
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000,
      },
})
