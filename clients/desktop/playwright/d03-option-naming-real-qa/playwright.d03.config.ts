import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  reporter: 'line',
  use: { ...devices['Desktop Chrome'], headless: true },
})
