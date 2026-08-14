import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: ['1203-reconv3-navigation-real-qa.spec.ts'],
  workers: 1,
  timeout: 300_000,
  reporter: 'line',
  use: { headless: true },
})
