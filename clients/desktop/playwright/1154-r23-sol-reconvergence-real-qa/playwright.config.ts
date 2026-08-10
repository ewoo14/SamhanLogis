import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 15 * 60_000,
  fullyParallel: false,
  workers: 1,
  use: { headless: true, baseURL: 'http://127.0.0.1:5224' },
  reporter: [['line']],
})
