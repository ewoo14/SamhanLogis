import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './playwright',
  testIgnore: [],
  timeout: 120000,
  workers: 1,
  reporter: [['line']],
  use: { baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5175', viewport: { width: 1440, height: 900 }, headless: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: undefined,
})

