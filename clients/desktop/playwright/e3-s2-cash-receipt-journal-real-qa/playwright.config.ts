/**
 * E3 S2 입금보고서 분개/역분개 — 실 서버 QA 전용 Playwright 설정.
 * VITE_MOCK_MODE OFF — 실 게이트웨이 :8080 연결. 렌더러 :5175 선기동 필요
 * (`node_modules/.bin/vite dev --config vite.renderer.dev.config.ts`).
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
