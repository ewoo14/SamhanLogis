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

const MOCK_APP_VERSION = process.env['VITE_APP_VERSION']?.trim() || '2026/07/25-1'

export default defineConfig({
  testDir: './playwright',
  // opt-out 컨벤션: 실서버/실QA·수동 캡처 전용 스펙 제외(나머지 mock 회귀는 자동 게이트)
  testIgnore: [
    '**/manual/**',
    '**/full-qa/**',
    '**/audit/**',
    '**/phase-2-4-real-qa/**',
    '**/*-real-qa.spec.ts',
    '**/*-real-qa/**',
    // 1131 adversarial live probes require a deployed API plus QA credentials;
    // this job is the mock hard gate, so keep those probes out of the mock run.
    '**/1131-r10-sol-review/**',
    '**/1131-r2-adversarial/1131-r2-live-readonly.spec.ts',
    '**/1131-r5-adversarial/1131-r5-live.spec.ts',
    '**/1131-r6-adversarial/1131-r6-live.spec.ts',
    // #1151 live reconvergence 는 mock hard gate 대상이 아니다. 실 SSE/source-journal 검증을 보존한다.
    '**/1151-final-reconv.spec.ts',
    '**/1151-postmerge-sol-reconv.spec.ts',
    // 레거시 GAS 소스 의존 스펙은 mock 회귀가 아니므로 3-A2 컨벤션 대상에서 제외한다.
    '**/full-menu-contract/**',
    // 🔴 3-A2 QUARANTINE — 기존 미실행 레거시 스펙 드리프트(335 통과분과 분리). 추적·수리: docs/dev-reports/slice-3-a2-desktop-playwright-ci-gate.md. 신규 mock 스펙은 본 목록과 무관하게 자동 게이트됨.
    // 🟢 3-A2-④ 재게이트 완료(green) — sp-d2(회계 5/5)·sp-d3(슬립/배차 9/9). 이중 가드(RoleGuard+PermissionGuard)
    //   차단 판정을 sp-d4 검증 패턴으로 교정 + 광범위 page.route 제거(SPA redirect 간섭). 상세:
    //   docs/dev-reports/slice-3a2-4-rbac-regate.md.
    // 🟢 admin-hr 재게이트 완료(5/5) — TC-HR2 부서 route-게이팅은 AdminLayout(isExecutiveOffice) 으로 이미
    //   구현돼 있었고, mock(is-executive-office)이 hash query 의 mockDepartment 를 못 읽던 버그를 교정해 테스트 가능해짐.
    // 🟢 sp-d1 재게이트 완료 — role-grid→account-select UI 재설계 대응 스펙 재작성 + 한글 라벨/권한설정/한국어404 (PR #386 — #380 supersede).
    // sp-09-5 (발주서 업로드 OCR) — PR #658 에서 메뉴·구현·스펙 전체 삭제됨.
    // 🟢 phase-2-6c 재게이트(8/8) — 전환 모달 창고선택+qty 상호작용 + 재고현황 페이지 제목 testid 한정.
    // 🟢 sp-09-1 재게이트(5/5) — eTaxExternalId 표시(FE) + emit 낙관적 갱신.
    // 🟢 3-A2-④ B/C 재게이트 — sp-d4(잔여 7도메인 PermissionGuard, 20 TC 전부 green) 재게이트 완료.
    //   잔여 격리 스펙은 각 기능별 verify-then-fix 필요 — triage 후 격리 유지
    //   (sp-09-1 eTaxExternalId 는 위 5/5 재게이트 완료 항목으로 정정):
    //   phase-2-6c(8: 재고현황 모달), sp-09-2(5: 알리고 SMS),
    //   sp-09-3/sp-09-4/sp-09-5 — PR #658 에서 OCR·KFTC·발주서 메뉴·스펙 전체 삭제됨.
    //   sp-08-6-6(2: 발행 CTA/라벨), phase-2-5(1: ON_HOLD 필터),
    //   supplier-profile(1: seed 필드), tax-invoice-batch(1: 4탭). 상세: docs/dev-reports/slice-3a2-4-bc-triage.md.
  ],
  timeout: 60_000,
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 2 : 1,
  reporter: process.env['CI']
    ? [['line'], ['json', { outputFile: 'playwright-json/results.json' }], ['html', { open: 'never' }]]
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
        command: 'npx vite src/renderer --config vite.config.ts --host 127.0.0.1 --port 5173',
        env: {
          VITE_MOCK_MODE: '1',
          VITE_APP_VERSION: MOCK_APP_VERSION,
        },
        url: 'http://127.0.0.1:5173/',
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000,
      },
})
