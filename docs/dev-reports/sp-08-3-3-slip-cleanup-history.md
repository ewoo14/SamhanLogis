# SP-08-3-3 전표정리 저장내역 구현 리포트

## 범위

- `slip-service`에 `slip_cleanup_save_history` JSONB 저장내역 도메인과 `/slips/cleanup/history` API 4종을 추가했다.
- desktop `/sales/slip-cleanup`에 `실행 / 저장내역` 2탭, latest 자동 복원, 명시 저장, row click 복원을 연결했다.
- 내부 UUID는 상세 path param과 React 상태에서만 사용하고, row `data-testid`는 `slip-cleanup-history-row-{i}` index 기반으로 둔다.

## Backend

- Entity: `SlipCleanupSaveHistory`
  - `BaseEntity` 7 audit 상속
  - `@SQLRestriction("is_deleted = false")`
  - `programType=SLIP_CLEANUP`, `saveMode=AUTO_LATEST|MANUAL_NAMED`, `topic`, `requestParams`, `responsePayload`
- Migration: `V25__add_slip_cleanup_save_history.sql`
  - `JSONB` request/response payload
  - `ux_slip_cleanup_history_auto_latest_per_user_program`
  - active row partial index
- Service 정책:
  - `AUTO_LATEST`: 사용자+프로그램 active 1건, 기존 row soft-delete 후 신규 insert
  - partial unique race 시 3회 retry + `REQUIRES_NEW` `TransactionTemplate`
  - `MANUAL_NAMED`: topic 필수 append-only
  - response payload 100KB 초과 시 422 `SLIP_CLEANUP_HISTORY_PAYLOAD_TOO_LARGE`
  - from/to 역전 시 내부 range swap
  - 상세 조회는 `findByIdAndCreatedBy`로 사용자 격리
- 권한:
  - 기존 `GET /slips/cleanup`과 동일한 `SALES / MANAGER / MASTER`

## Frontend

- API: `slipCleanupSaveHistoryApi.ts`
- 컴포넌트:
  - `SlipCleanupHistoryTab.tsx`
  - `SlipCleanupRestoredBanner.tsx`
  - `SlipCleanupSaveDialog.tsx`
- 화면:
  - `/sales/slip-cleanup`에 `Tabs` 기반 `실행 / 저장내역` UX 추가
  - 자동 저장 실패는 조회 UX를 막지 않고 silent 처리
  - 복원 배너의 `createdBy`는 `maskCreatedBy` 재사용

## QA

- Playwright static/mock contract:
  - `clients/desktop/playwright/sp-08-3-3-slip-cleanup-history/sp-08-3-3-slip-cleanup-history.spec.ts`
- Mock PNG generator:
  - `scripts/generate-sp-08-3-3-slip-cleanup-history-screenshots.ps1`
  - output: `docs/qa/sp-08-3-3-slip-cleanup-history/screenshots/`
  - QA mock PNG 생성 스크립트는 Windows System.Drawing 전용이며 Linux CI에서는 실행하지 않는다.

## Verification

실행 결과는 최종 PR/커밋 보고에 기록한다.
