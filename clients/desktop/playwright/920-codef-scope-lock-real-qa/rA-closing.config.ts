/**
 * 닫는 적대검증 리뷰어 A — 05b8c9e5a 의 새 신호 2개(scopeConfirmedThisMount /
 * scopeBaselineUnconfirmed)를 실 Chromium + 실 데스크톱 렌더러(:5253)에서 깨뜨리는 하네스.
 *
 * 🚨 공유 데이터 미접촉 — /accounting/codef/** 전 엔드포인트를 page.route 로 가로챈다.
 * 로그인만 실 게이트웨이(:8080) 읽기 전용.
 *
 * 사용: cd clients/desktop && npx playwright test --config=playwright/920-codef-scope-lock-real-qa/rA-closing.config.ts
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: ['rA-closing.spec.ts'],
  timeout: 90_000,
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
