/**
 * 개발책임자 바운드 결정(2026-07-25, PR #925) 되돌림 검증 라운드 B.
 *
 * rA-closing 이 실측한 A1/A2/A3(무음 데이터 파괴·거짓 안심)가 두 UX 기제 되돌림 이후
 * 재현되지 않는지(Z1·Z2), N-1/N-3(Z3)는 그대로 닫혀 있는지를 실 데스크톱 렌더러(:5253)에서
 * 확인한다.
 *
 * 🚨 공유 데이터 미접촉 — /accounting/codef/** 전 엔드포인트를 page.route 로 가로챈다.
 * 로그인만 실 게이트웨이(:8080) 읽기 전용.
 *
 * 사용: cd clients/desktop && npx playwright test --config=playwright/920-codef-scope-lock-real-qa/rB-bound-revert.config.ts
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: ['rB-bound-revert.spec.ts'],
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
