import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '1254-luna-final-real-qa.spec.ts',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
})
