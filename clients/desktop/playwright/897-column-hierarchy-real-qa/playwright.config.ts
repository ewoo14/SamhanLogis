/**
 * #897 실 서버 QA 설정 — 렌더러 5252, 게이트웨이 8080, mock OFF.
 * 기본 mock Playwright 설정과 분리해 실 QA 스펙이 자동 회귀 스위트에 섞이지 않게 한다.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5252',
    viewport: { width: 1600, height: 1000 },
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
  },
  projects: [{
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } },
  }],
})
