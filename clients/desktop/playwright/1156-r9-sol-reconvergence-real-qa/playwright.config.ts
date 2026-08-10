import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 240_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  projects: [{
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1100 } },
  }],
})
