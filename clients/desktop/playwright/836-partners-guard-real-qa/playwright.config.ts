/**
 * #836 PartnersPage ACCOUNTANT 4탭 가드 라이브 QA 전용 설정.
 * VITE_MOCK_MODE OFF — 실 게이트웨이 :8080 연결. 렌더러 선기동 필요:
 *   VITE_API_BASE_URL=http://localhost:8080 node_modules/.bin/vite dev \
 *     --config vite.renderer.dev.config.ts --port 5216 --strictPort
 * 실행:
 *   AUDIT_BASE_URL=http://127.0.0.1:5216 node_modules/.bin/playwright test \
 *     --config=playwright/836-partners-guard-real-qa/playwright.config.ts --reporter=line
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5216',
    viewport: { width: 1440, height: 900 },
    screenshot: 'on',
    video: 'off',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
