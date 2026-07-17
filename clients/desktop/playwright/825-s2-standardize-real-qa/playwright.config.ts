/**
 * #825 슬2 거래처 입력 표준화 라이브 QA.
 * VITE_MOCK_MODE OFF — 실 게이트웨이 :8080. 렌더러 :5223(신 design-system dist·슬2 코드) 선기동.
 * 실행: AUDIT_BASE_URL=http://127.0.0.1:5223 node_modules/.bin/playwright test --config=playwright/825-s2-standardize-real-qa/playwright.config.ts --reporter=line
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 150_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5223',
    viewport: { width: 1440, height: 900 },
    screenshot: 'on',
    video: 'off',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
