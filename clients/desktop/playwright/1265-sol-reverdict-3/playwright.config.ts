import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 420_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    animations: 'disabled',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
