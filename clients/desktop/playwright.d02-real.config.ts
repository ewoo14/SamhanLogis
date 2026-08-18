import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './playwright',
  testIgnore: [],
  timeout: 60_000,
  use: { baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5942', headless: true, viewport: { width: 1440, height: 900 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
