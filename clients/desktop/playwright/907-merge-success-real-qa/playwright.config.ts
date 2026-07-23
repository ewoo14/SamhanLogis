/**
 * #907 게이트③ — 주문 병합 "성공" 경로 라이브 QA 설정.
 * VITE_MOCK_MODE OFF, 실 게이트웨이 :8080. 렌더러 선기동
 * (`vite --config vite.renderer.dev.config.ts --port 5300 --strictPort`).
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 240_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5300',
    viewport: { width: 1600, height: 1000 },
    screenshot: 'on',
    video: 'off',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
