/**
 * PR #784 warning 토큰 AA sweep — 실서버 GUI QA 설정. VITE_MOCK_MODE OFF, 렌더러 :5191 선기동 필요
 * (node_modules/.bin/vite dev --config vite.renderer.dev.config.ts --port 5191 --strictPort).
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5191',
    viewport: { width: 1440, height: 900 },
    screenshot: 'on',
    video: 'off',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
