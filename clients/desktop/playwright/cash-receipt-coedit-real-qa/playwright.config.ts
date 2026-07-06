/**
 * E3 S4d 입금보고서 coedit — 실 서버 GUI QA 전용 Playwright 설정. VITE_MOCK_MODE OFF, :8080 프록시.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5177',
    viewport: { width: 1440, height: 900 },
    screenshot: 'on',
    video: 'off',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
