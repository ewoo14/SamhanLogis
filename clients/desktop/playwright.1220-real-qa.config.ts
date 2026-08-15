import base from './playwright.config'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  ...base,
  testDir: './playwright/1220-adversarial-real-qa',
  testMatch: '1220-dev-fallback-real-qa.spec.ts',
  testIgnore: [],
  workers: 1,
  retries: 0,
  reporter: 'line',
})
