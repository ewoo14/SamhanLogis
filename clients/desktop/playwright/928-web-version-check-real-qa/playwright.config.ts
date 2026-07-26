import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const configDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(configDir, '../../../..')

export default defineConfig({
  testDir: configDir,
  testMatch: ['**/*-real-qa.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env['QA_BASE_URL'] ?? 'http://127.0.0.1:5181',
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  timeout: 60000,
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 5181 --strictPort',
    cwd: path.join(repoRoot, 'clients/web/order-app'),
    url: 'http://127.0.0.1:5181',
    reuseExistingServer: false,
    timeout: 30000,
  },
})
