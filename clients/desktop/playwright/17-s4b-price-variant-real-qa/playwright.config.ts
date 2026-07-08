/**
 * #17 단가변동 S4b — `/sales/estimate-config` 라이브 QA 전용 설정.
 *
 * VITE_MOCK_MODE OFF — 실 게이트웨이 :8080 연결. 렌더러 선기동 필요
 * (`node_modules/.bin/vite dev --config vite.renderer.dev.config.ts --port <포트> --strictPort`,
 * `VITE_API_BASE_URL=http://localhost:8080`).
 *
 * 캡처 대상:
 *  - dev_master: 견적 가격 설정(옵션 기본값) + 카테고리별 단가변동 4행 동시노출, 홈멀티 PUT 왕복
 *  - dev_accountant: H1 옵션A — 단가변동 섹션만 노출(estimate-config 폼 미표시, GET 미발생)
 *  - dev_sales: 네거티브 — 사이드바 링크 부재 + 직접 진입 시 홈 redirect
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5195',
    viewport: { width: 1440, height: 1400 },
    screenshot: 'on',
    video: 'off',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
