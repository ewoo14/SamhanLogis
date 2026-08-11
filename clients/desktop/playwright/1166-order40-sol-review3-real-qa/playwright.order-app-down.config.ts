import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: ['1166-order40-sol-review3-down-real-qa.spec.ts'],
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: { baseURL: 'http://127.0.0.1:5321', viewport: { width: 1440, height: 1000 }, headless: true,
    screenshot: 'only-on-failure', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm --prefix ../../../web/order-app run dev -- --host 127.0.0.1 --port 5321',
    env: { VITE_API_BASE_URL: '/api/v1', VITE_VERSION_API_BASE_URL: 'http://127.0.0.1:5321',
      VITE_APP_VERSION: '2026/08/11-63' },
    url: 'http://127.0.0.1:5321/', reuseExistingServer: false, timeout: 120_000,
  },
})
