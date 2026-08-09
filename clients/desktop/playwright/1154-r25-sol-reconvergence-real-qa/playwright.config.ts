import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 20 * 60_000,
  expect: { timeout: 30_000 },
  workers: 1,
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
})
