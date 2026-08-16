import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: { baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173', headless: true, screenshot: 'on', video: 'off', viewport: { width: 2400, height: 1000 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
