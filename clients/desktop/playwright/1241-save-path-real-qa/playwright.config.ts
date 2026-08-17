import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  workers: 1,
  reporter: [['line']],
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    screenshot: 'only-on-failure',
  },
})
