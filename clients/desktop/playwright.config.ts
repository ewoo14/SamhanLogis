/**
 * Playwright 설정 — Desktop 클라이언트 mock 회귀 hard gate.
 *
 * dev server 는 기본적으로 VITE_MOCK_MODE=1 로 자동 기동됨.
 * AUDIT_BASE_URL 환경 변수로 dev server 주소 재정의 가능 (기본: http://127.0.0.1:5173).
 *
 * 실행 예:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173 &
 *   npx playwright test playwright/manual/manual-capture.spec.ts --reporter=line
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './playwright',
  // opt-out 컨벤션: 실서버/실QA·수동 캡처 전용 스펙 제외(나머지 mock 회귀는 자동 게이트)
  testIgnore: [
    '**/manual/**',
    '**/full-qa/**',
    '**/audit/**',
    '**/phase-2-4-real-qa/**',
    '**/*-real-qa.spec.ts',
    // 레거시 GAS 소스 의존 스펙은 mock 회귀가 아니므로 3-A2 컨벤션 대상에서 제외한다.
    '**/full-menu-contract/**',
    // 🔴 3-A2 QUARANTINE — 기존 미실행 레거시 스펙 드리프트(335 통과분과 분리). 추적·수리: docs/dev-reports/slice-3-a2-desktop-playwright-ci-gate.md. 신규 mock 스펙은 본 목록과 무관하게 자동 게이트됨.
    '**/admin-hr/**',
    '**/operational/**',
    '**/partner-ui-menu-gap/**',
    '**/permission-overhaul/applayout.spec.ts',
    '**/phase-2-5-partner-order-hold/**',
    '**/phase-2-6c-inventory-deduction/**',
    '**/purchase-inspection-cta/**',
    '**/sp-06-notion-db-crud/**',
    '**/sp-08-3-2-arologis-history/**',
    '**/sp-08-3-3-slip-cleanup-history/**',
    '**/sp-08-3-4-dispatch-sms-history/**',
    '**/sp-08-3-dispatch-parity/**',
    '**/sp-08-4-1-partner-order-list-detail/**',
    '**/sp-08-4-2-partner-order-edit-put/**',
    '**/sp-08-4-3-order-delete-and-estimate-convert/**',
    '**/sp-08-4-4-order-print-form/**',
    '**/sp-08-5-1-purchase-slip-list-detail/**',
    '**/sp-08-5-2-purchase-slip-edit-put/**',
    '**/sp-08-5-3-purchase-slip-soft-delete/**',
    '**/sp-08-5-5-purchase-print-form/**',
    '**/sp-08-6-1-sales-slip-list-detail/**',
    '**/sp-08-6-2-sales-slip-edit-put/**',
    '**/sp-08-6-3-sales-slip-soft-delete/**',
    '**/sp-08-6-4-sales-print-form/**',
    '**/sp-08-6-5-accounting-daily-ledger/**',
    '**/sp-08-6-6-tax-invoice-emit/**',
    '**/sp-08-legacy-gas-db-api-parity/**',
    '**/sp-09-1-nts-etax-emit-shell/**',
    '**/sp-09-2-aligo-sms-real-send/**',
    '**/sp-09-3-ocr-receipt-shell/**',
    '**/sp-09-4-kftc-shell/**',
    '**/sp-09-5-vendor-integration/**',
    '**/sp-d1-dynamic-rbac/**',
    '**/sp-d2-accounting-permission-migration/**',
    '**/sp-d3-slip-dispatch-permission-migration/**',
    '**/sp-d4-remaining-pages-permission-migration/**',
    '**/sp-d6-1-permission-migration/**',
    '**/supplier-profile/**',
    '**/tax-invoice-batch/**',
  ],
  timeout: 60_000,
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 2 : 1,
  reporter: process.env['CI']
    ? [['line'], ['json', { outputFile: 'playwright-report/results.json' }], ['html', { open: 'never' }]]
    : [['line'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env['PLAYWRIGHT_SKIP_WEB_SERVER'] === '1'
    ? undefined
    : {
        command: 'npx vite src/renderer --host 127.0.0.1 --port 5173',
        env: { VITE_MOCK_MODE: '1' },
        url: 'http://127.0.0.1:5173/',
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000,
      },
})
