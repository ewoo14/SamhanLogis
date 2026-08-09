import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 720_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
    ...devices['Desktop Chrome'],
  },
})
