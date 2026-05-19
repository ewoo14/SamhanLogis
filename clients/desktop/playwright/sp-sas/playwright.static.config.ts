import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
})
