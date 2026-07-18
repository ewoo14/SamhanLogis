import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export default defineConfig({
  testDir: '.',
  testMatch: ['**/ac-5-chip-multiselect.spec.ts'],
  // 이 스위트는 기본 testIgnore에 걸리지 않는 자동 hard gate다.
  testIgnore: [],
  timeout: 120_000,
  workers: 1,
  reporter: [['line'], ['json', { outputFile: 'playwright-json/ac-5-chip-multiselect.json' }]],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    screenshot: 'on',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env['PLAYWRIGHT_SKIP_WEB_SERVER'] === '1'
    ? undefined
    : {
      command: 'npx vite --config vite.config.ts src/renderer --host 127.0.0.1 --port 5173',
        cwd: repoDir,
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: true,
        timeout: 120_000,
        env: { ...process.env, VITE_MOCK_MODE: '1' },
      },
})
