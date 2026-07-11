/**
 * PR #784 arologis-desktop warning 토큰 AA sweep — 실서버 GUI QA 설정.
 * 렌더러 :5291 선기동 필요 (node_modules/.bin/vite dev --config vite.renderer.dev.config.ts --port 5291 --strictPort).
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5291',
    viewport: { width: 1440, height: 900 },
    screenshot: 'on',
    video: 'off',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
