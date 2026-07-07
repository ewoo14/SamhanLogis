/**
 * E2 주문 목록 soft-delete/복원/누출차단 실서버 GUI QA 전용 Playwright 설정.
 * VITE_MOCK_MODE OFF, 게이트웨이 :8080 프록시 없는 실 API 패스스루, vite :5199.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5199',
    viewport: { width: 1440, height: 900 },
    screenshot: 'on',
    video: 'off',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
