/**
 * E1-b-1 출고 전표 인라인 편집 — 실서버 2세션 coedit GUI QA 전용 Playwright 설정.
 * VITE_MOCK_MODE OFF — 실 게이트웨이 :8080. 렌더러 :5175 선기동 필요.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175',
    viewport: { width: 1440, height: 900 },
    screenshot: 'on',
    video: 'off',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
