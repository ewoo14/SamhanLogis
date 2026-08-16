import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*-real-qa.spec.ts',
  timeout: 60_000,
  workers: 1,
  reporter: 'line',
  use: { headless: true, actionTimeout: 15_000, navigationTimeout: 30_000 },
})
