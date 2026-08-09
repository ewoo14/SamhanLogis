import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/1127-r6-sol-reconv-real-qa.spec.ts',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5233',
    viewport: { width: 1440, height: 900 },
    headless: true,
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
