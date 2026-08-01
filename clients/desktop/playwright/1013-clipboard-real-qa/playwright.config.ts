/**
 * PR #591 슬3 — 타배송사 SMS 발송 실 서버 QA 전용 Playwright 설정.
 * VITE_MOCK_MODE OFF — 실 게이트웨이 :8080 연결(renderer :5932 수동 기동).
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5932',
    viewport: { width: 1440, height: 900 },
    screenshot: 'on',
    video: 'off',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
