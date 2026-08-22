import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    viewport: { width: 1600, height: 1000 },
  },
})
