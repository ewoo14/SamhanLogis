import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/1163-fix3-live-real-qa.spec.ts',
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:56349',
    headless: true,
  },
})
