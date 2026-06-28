import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch: ['**/settings-doctype.spec.ts'], timeout: 120_000, workers: 1, reporter: [['line']],
  use: { baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175', viewport: { width: 1440, height: 900 }, screenshot: 'on', headless: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
