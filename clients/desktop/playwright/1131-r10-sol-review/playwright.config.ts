import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: ['1131-r10-sol-review.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  timeout: 120_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:51131',
    viewport: { width: 1440, height: 900 },
    headless: true,
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    video: 'off',
  },
})
