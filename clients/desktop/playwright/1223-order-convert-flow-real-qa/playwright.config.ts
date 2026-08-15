import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testIgnore: [],
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'],
    viewport: { width: 1440, height: 900 },
    headless: true,
    animations: 'disabled',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
