# Slice 3-A2 Desktop Playwright CI Gate

## 1. 게이트 구조

3-A2의 목표는 `clients/desktop/playwright/**` 아래 신규 mock 회귀 스펙이 CI에서 자동 실행되도록 hard gate를 세우는 것이다. 운영 방식은 opt-out 컨벤션, CI 잡, 실행 건수 가드의 3단 구조다.

- opt-out 컨벤션: 실서버/실QA, 수동 캡처, 감사/real QA, 레거시 GAS 소스 의존 계약처럼 mock 회귀가 아닌 스펙만 `playwright.config.ts`의 `testIgnore`에 명시한다.
- CI 잡: desktop Playwright mock 회귀 스펙을 별도 게이트로 실행하고, JSON reporter 결과를 남긴다.
- 가드: `scripts/assert-playwright-ran.mjs`가 `playwright-report/results.json`의 `stats.expected`를 확인해 통과 테스트 0건 false-green을 차단한다. 조건부 skip은 잔여 통과셋에서 정당하게 발생할 수 있으므로 경고로 남기되, `skipped > expected`는 전량 skip 위장 가능성으로 실패시킨다.

## 2. 트리아지 결과

로컬 전수 실행 결과는 335 pass / 77 fail / 4 skip이다. 실패 77건은 39개 파일에 집중되어 있으며, 이번 3-A2 신규 mock 회귀 스펙의 결함이 아니라 기존 미실행 레거시 스펙 드리프트로 분류했다.

초기 load-error를 복구한 뒤 Playwright 수집은 416 tests까지 정상화되었다. 이 중 핵심 mock 회귀 스펙인 `partner-order-list-badge-refresh`, `d2-6d-inventory-lookup`, `d2-order-merge` 등은 통과했고, 3-A2 게이트 보호 대상에 남아 있다.

## 3. QUARANTINE 추적목록

아래 목록은 3-A2 QUARANTINE으로 투명 격리한다. 각 항목은 후속 수리 슬라이스에서 원인 재현, mock 계약 갱신, selector/route 정합 복구, 재게이트 순서로 해제한다.

### 동적 RBAC / AppLayout 드리프트

- `permission-overhaul/applayout.spec.ts`
- `sp-d1-dynamic-rbac/`
- `sp-d2-accounting-permission-migration/`
- `sp-d3-slip-dispatch-permission-migration/`
- `sp-d4-remaining-pages-permission-migration/`
- `sp-d6-1-permission-migration/`

### 정적 계약 / Phase 8-9 레거시 계약

- `sp-08-3-2-arologis-history/`
- `sp-08-3-3-slip-cleanup-history/`
- `sp-08-3-4-dispatch-sms-history/`
- `sp-08-3-dispatch-parity/`
- `sp-08-4-1-partner-order-list-detail/`
- `sp-08-4-2-partner-order-edit-put/`
- `sp-08-4-3-order-delete-and-estimate-convert/`
- `sp-08-4-4-order-print-form/`
- `sp-08-5-1-purchase-slip-list-detail/`
- `sp-08-5-2-purchase-slip-edit-put/`
- `sp-08-5-3-purchase-slip-soft-delete/`
- `sp-08-5-5-purchase-print-form/`
- `sp-08-6-1-sales-slip-list-detail/`
- `sp-08-6-2-sales-slip-edit-put/`
- `sp-08-6-3-sales-slip-soft-delete/`
- `sp-08-6-4-sales-print-form/`
- `sp-08-6-5-accounting-daily-ledger/`
- `sp-08-6-6-tax-invoice-emit/`
- `sp-08-legacy-gas-db-api-parity/`
- `sp-09-1-nts-etax-emit-shell/`
- `sp-09-2-aligo-sms-real-send/`
- `sp-09-3-ocr-receipt-shell/`
- `sp-09-4-kftc-shell/`
- `sp-09-5-vendor-integration/`

### 드리프트 UI / 운영 검증 레거시

- `admin-hr/`
- `tax-invoice-batch/`
- `supplier-profile/`
- `phase-2-5-partner-order-hold/`
- `phase-2-6c-inventory-deduction/`
- `purchase-inspection-cta/`
- `partner-ui-menu-gap/`
- `operational/`
- `sp-06-notion-db-crud/`

## 4. 핵심 mock 회귀 보호

QUARANTINE은 기존 미실행 레거시 드리프트를 335 통과분과 분리하기 위한 임시 추적 장치다. 신규 mock 스펙은 이 목록과 무관하게 자동 게이트되며, 다음 회귀 스펙은 계속 수집·실행 대상에 남는다.

- `partner-order-list-badge-refresh/`
- `d2-6d-inventory-lookup/`
- `d2-order-merge/`
- `ac-2-product-autocomplete/`
- `ac-3-partner-autocomplete/`

