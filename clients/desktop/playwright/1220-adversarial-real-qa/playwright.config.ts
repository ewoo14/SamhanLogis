import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '1220-adversarial-real-qa.spec.ts',
  timeout: 60_000,
  workers: 1,
  reporter: 'line',
})
