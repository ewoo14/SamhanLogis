/**
 * Playwright 설정 — Desktop 클라이언트 manual 캡처 + full-screen-audit.
 *
 * dev server 가 VITE_MOCK_MODE=1 로 가동 중이어야 함.
 * AUDIT_BASE_URL 환경 변수로 dev server 주소 재정의 가능 (기본: http://127.0.0.1:5173).
 *
 * 실행 예:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173 &
 *   npx playwright test playwright/manual/manual-capture.spec.ts --reporter=line
 */
import { defineConfig, devices } from '@playwright/test'

const skipWebServer = process.env['PLAYWRIGHT_SKIP_WEB_SERVER'] === '1'

export default defineConfig({
  testDir: './playwright',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['line'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : {
        command: 'set VITE_MOCK_MODE=1&& npx vite src/renderer --host 127.0.0.1 --port 5173',
        url: 'http://127.0.0.1:5173/',
        reuseExistingServer: true,
        timeout: 120_000,
      },
})
