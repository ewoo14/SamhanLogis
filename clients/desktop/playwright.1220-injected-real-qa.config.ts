import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './playwright/1220-adversarial-real-qa',
  testMatch: '1220-injected-production-real-qa.spec.ts',
  timeout: 60_000,
  workers: 1,
  reporter: 'line',
  use: { headless: true, viewport: { width: 1440, height: 900 } },
})
