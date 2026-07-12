/**
 * PR #795 — SeverityBadge AA 대비(알림 내역 INFO/WARNING/CRITICAL) 실서버 GUI QA 설정.
 * VITE_MOCK_MODE OFF, 렌더러 :5193 선기동 필요
 * (node_modules/.bin/vite dev --config vite.renderer.dev.config.ts --port 5193 --strictPort).
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5193',
    viewport: { width: 1280, height: 900 },
    screenshot: 'on',
    video: 'off',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
