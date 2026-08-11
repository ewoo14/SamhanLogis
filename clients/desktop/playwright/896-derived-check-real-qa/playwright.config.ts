import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  workers: 1,
  reporter: 'line',
  use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 }, headless: true },
})
