/**
 * #825 슬1 거래처 자동완성 ④ 매치 하이라이트 라이브 QA.
 * VITE_MOCK_MODE OFF — 실 게이트웨이 :8080. 렌더러 :5213(신 design-system dist) 선기동.
 * 실행: AUDIT_BASE_URL=http://127.0.0.1:5213 node_modules/.bin/playwright test --config=playwright/825-s1-highlight-real-qa/playwright.config.ts --reporter=line
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5213',
    viewport: { width: 1440, height: 900 },
    screenshot: 'on',
    video: 'off',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
