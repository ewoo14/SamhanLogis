/**
 * PR #672 필드 soft-lock FieldLockIndicator QA — 스크린샷 전용 Playwright 설정.
 *
 * VITE_MOCK_MODE=1 dev 서버를 포트 5176 에 자동 기동(root 5173 과 충돌 방지).
 * webServer.cwd 를 clients/desktop/ 로 고정해야 vite src/renderer 명령이 동작한다.
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules/.bin/playwright test --config playwright/slip-collab/field-lock-shots.config.ts
 */
import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'url'
import * as path from 'path'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
// playwright/slip-collab/ → clients/desktop/
const desktopRoot = path.resolve(_dirname, '../..')

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5176'

export default defineConfig({
  testDir: '.',
  testMatch: ['**/field-lock.shots.spec.ts'],
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: BASE_URL,
    screenshot: 'off',
    video: 'off',
    headless: true,
  },
  projects: [
    {
      name: 'desktop-1280x800',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'mobile-390x844',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: process.env['PLAYWRIGHT_SKIP_WEB_SERVER'] === '1'
    ? undefined
    : {
        command: 'npx vite src/renderer --config vite.config.ts --host 127.0.0.1 --port 5176',
        env: { VITE_MOCK_MODE: '1' },
        url: 'http://127.0.0.1:5176/',
        reuseExistingServer: true,
        timeout: 120_000,
        cwd: desktopRoot,
      },
})
