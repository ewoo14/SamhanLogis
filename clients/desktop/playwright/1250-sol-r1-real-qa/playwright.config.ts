import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 300_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 2400, height: 1200 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 2400, height: 1200 } } }],
})
