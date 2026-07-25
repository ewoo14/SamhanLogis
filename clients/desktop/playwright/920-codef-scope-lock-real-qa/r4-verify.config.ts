/**
 * 재수렴 R4(N-1~N-4) fix 구현자 자체 검증 설정.
 *
 * 실 데스크톱 렌더러(:5253)를 실제 Chromium 으로 구동하되, CODEF 관련 백엔드 호출은 전부
 * page.route 로 가로챈다 — 공유 connected-main 범위·bank_transaction 적재 경로를 전혀
 * 건드리지 않는다(직전 리뷰어 2명이 실서버 도달 0건을 달성한 방법과 동일).
 *
 * 사용: cd clients/desktop && npx playwright test --config=playwright/920-codef-scope-lock-real-qa/r4-verify.config.ts
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: ['r4-verify.spec.ts'],
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['QA_BASE_URL'] ?? 'http://127.0.0.1:5253',
    viewport: { width: 1440, height: 960 },
    screenshot: 'off',
    video: 'off',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
