import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  use: { headless: true },
  reporter: [['line']],
})
