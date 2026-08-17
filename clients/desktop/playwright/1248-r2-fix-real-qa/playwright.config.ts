import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '..',
  testMatch: '**/1248-r2-fix-real-qa.spec.ts',
  testIgnore: [],
  timeout: 60_000,
  workers: 1,
  reporter: 'line',
  use: { ...devices['Desktop Chrome'], headless: true, baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5943' },
})
